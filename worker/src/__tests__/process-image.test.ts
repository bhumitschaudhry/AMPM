import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

// Mock all external dependencies before importing the module under test
vi.mock('../db', () => ({
  default: {
    image: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'img-1',
        mimeType: 'image/jpeg',
        fileSize: 1024,
        storedPath: '/tmp/test.jpg',
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    job: { findUnique: vi.fn().mockResolvedValue({ userId: 'user-1' }) },
    notification: { create: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock('../storage/r2-client', () => ({
  downloadFromR2: vi.fn().mockResolvedValue(Buffer.from('fake-image')),
}));

vi.mock('sharp', () => ({
  default: vi.fn(() => ({ toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed')) })),
}));

vi.mock('../pipeline/generate-caption', () => ({
  generateCaption: vi.fn().mockResolvedValue('a photo of a cat'),
}));

vi.mock('../pipeline/detect-labels', () => ({
  detectLabels: vi.fn().mockResolvedValue([{ name: 'Cat', score: 0.95 }]),
}));

vi.mock('../pipeline/check-content-safety', () => ({
  checkContentSafety: vi.fn().mockResolvedValue({
    isSafe: true,
    categories: { adult: 'VERY_UNLIKELY', violence: 'VERY_UNLIKELY' },
    flaggedCategory: null,
  }),
}));

import { processImage } from '../process-image';
import prisma from '../db';
import { generateCaption } from '../pipeline/generate-caption';
import { checkContentSafety } from '../pipeline/check-content-safety';
import { detectLabels } from '../pipeline/detect-labels';

function createMockJob(overrides: { attemptsMade?: number; data?: Partial<Job['data']> } = {}): Job<any> {
  return {
    attemptsMade: overrides.attemptsMade ?? 2,
    discard: vi.fn().mockResolvedValue(undefined),
    data: {
      imageId: 'img-1',
      jobId: 'job-1',
      storedPath: '/tmp/test.jpg',
      ...overrides.data,
    },
  } as unknown as Job<any>;
}

describe('processImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes an image through the full pipeline successfully', async () => {
    await processImage(createMockJob());

    // Should set status to PROCESSING then COMPLETED
    expect(prisma.image.update).toHaveBeenCalledTimes(2);
    expect(prisma.image.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSING' }) }),
    );
    expect(prisma.image.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED', caption: 'a photo of a cat' }),
      }),
    );
  });

  it('executes Google Vision safety check and label detection before Hugging Face BLIP captioning', async () => {
    const callOrder: string[] = [];
    vi.mocked(checkContentSafety).mockImplementationOnce(async () => {
      callOrder.push('checkContentSafety');
      return { isSafe: true, categories: {}, flaggedCategory: null };
    });
    vi.mocked(detectLabels).mockImplementationOnce(async () => {
      callOrder.push('detectLabels');
      return [{ name: 'Cat', score: 0.95 }];
    });
    vi.mocked(generateCaption).mockImplementationOnce(async () => {
      callOrder.push('generateCaption');
      return 'a photo of a cat';
    });

    await processImage(createMockJob());

    expect(callOrder).toEqual(['checkContentSafety', 'detectLabels', 'generateCaption']);
  });

  it('stops after SafeSearch for unsafe images: skips labels and caption, flags, and notifies', async () => {
    vi.mocked(checkContentSafety).mockResolvedValueOnce({
      isSafe: false,
      categories: { adult: 'VERY_LIKELY', violence: 'VERY_UNLIKELY' },
      flaggedCategory: 'adult',
    });

    await processImage(createMockJob());

    // PROCESSING + COMPLETED + flag update = 3 image updates
    expect(prisma.image.update).toHaveBeenCalledTimes(3);
    expect(prisma.image.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          caption: null,
          labels: [],
        }),
      }),
    );
    expect(prisma.image.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isFlagged: true, flaggedCategory: 'adult' }) }),
    );
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', title: 'Image Flagged' }),
      }),
    );
    // Early exit: no further AI compute after SafeSearch flags the image
    expect(detectLabels).not.toHaveBeenCalled();
    expect(generateCaption).not.toHaveBeenCalled();
  });

  it('marks image as FAILED and rethrows on pipeline error', async () => {
    const pipelineError = new Error('model unavailable');
    vi.mocked(generateCaption).mockRejectedValueOnce(pipelineError);

    await expect(processImage(createMockJob())).rejects.toThrow('model unavailable');

    expect(prisma.image.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', failureReason: 'MAX_RETRIES_EXCEEDED' }),
      }),
    );
  });

  it('returns an image to PENDING while BullMQ has retry attempts remaining', async () => {
    const pipelineError = new Error('model unavailable');
    vi.mocked(generateCaption).mockRejectedValueOnce(pipelineError);

    await expect(processImage(createMockJob({ attemptsMade: 0 }))).rejects.toThrow('model unavailable');

    expect(prisma.image.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          retryCount: { increment: 1 },
          failureReason: 'INTERNAL_ERROR',
        }),
      }),
    );
  });

  it('fails an oversized queued image without calling AI providers', async () => {
    vi.mocked(prisma.image.findUnique).mockResolvedValueOnce({
      id: 'img-1',
      mimeType: 'image/jpeg',
      fileSize: 5 * 1024 * 1024 + 1,
      storedPath: '/tmp/test.jpg',
    } as any);

    await expect(processImage(createMockJob())).rejects.toThrow('exceeds the 5MB size limit');

    expect(generateCaption).not.toHaveBeenCalled();
    expect(prisma.image.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          failureReason: 'FILE_TOO_LARGE',
        }),
      }),
    );
  });

  it('discards the job for non-retryable failures so BullMQ does not re-run them', async () => {
    vi.mocked(prisma.image.findUnique).mockResolvedValueOnce({
      id: 'img-1',
      mimeType: 'image/gif',
      fileSize: 1024,
      storedPath: '/tmp/test.gif',
    } as any);

    const job = createMockJob();
    await expect(processImage(job)).rejects.toThrow('not supported');

    expect(job.discard).toHaveBeenCalledTimes(1);
    expect(generateCaption).not.toHaveBeenCalled();
  });

  it('does NOT discard the job for retryable failures still within attempt budget', async () => {
    const retryableError = new Error('model unavailable');
    vi.mocked(generateCaption).mockRejectedValueOnce(retryableError);

    const job = createMockJob({ attemptsMade: 0 });
    await expect(processImage(job)).rejects.toThrow('model unavailable');

    expect(job.discard).not.toHaveBeenCalled();
  });

  it('fails an unsupported queued image format without calling AI providers', async () => {
    vi.mocked(prisma.image.findUnique).mockResolvedValueOnce({
      id: 'img-1',
      mimeType: 'image/gif',
      fileSize: 1024,
      storedPath: '/tmp/test.gif',
    } as any);

    await expect(processImage(createMockJob())).rejects.toThrow('not supported');

    expect(generateCaption).not.toHaveBeenCalled();
    expect(prisma.image.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          failureReason: 'UNSUPPORTED_FORMAT',
        }),
      }),
    );
  });

  it('fails a corrupt image that fails sharp decoding without retrying', async () => {
    const sharp = await import('sharp');
    vi.mocked(sharp.default).mockImplementationOnce(() => ({
      toBuffer: vi.fn().mockRejectedValueOnce(new Error('Input buffer has corrupt header')),
    } as any));

    const job = createMockJob();
    await expect(processImage(job)).rejects.toThrow('Could not decode image file: Input buffer has corrupt header');

    expect(job.discard).toHaveBeenCalledTimes(1);
    expect(generateCaption).not.toHaveBeenCalled();
    expect(prisma.image.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          failureReason: 'INVALID_FILE',
        }),
      }),
    );
  });
});
