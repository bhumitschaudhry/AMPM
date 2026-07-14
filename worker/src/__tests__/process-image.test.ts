import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

// Mock all external dependencies before importing the module under test
vi.mock('../db', () => ({
  default: {
    image: { update: vi.fn().mockResolvedValue({}) },
    job: { findUnique: vi.fn().mockResolvedValue({ userId: 'user-1' }) },
    notification: { create: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('fake-image')),
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

function createMockJob(overrides: { attemptsMade?: number; data?: Partial<Job['data']> } = {}): Job<any> {
  return {
    attemptsMade: overrides.attemptsMade ?? 2,
    data: {
      imageId: 'img-1',
      jobId: 'job-1',
      storedPath: '/tmp/test.jpg',
      ...overrides.data,
    },
  } as Job<any>;
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

  it('flags unsafe images and creates a notification', async () => {
    vi.mocked(checkContentSafety).mockResolvedValueOnce({
      isSafe: false,
      categories: { adult: 'VERY_LIKELY', violence: 'VERY_UNLIKELY' },
      flaggedCategory: 'adult',
    });

    await processImage(createMockJob());

    // PROCESSING + COMPLETED + flag update = 3 image updates
    expect(prisma.image.update).toHaveBeenCalledTimes(3);
    expect(prisma.image.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isFlagged: true, flaggedCategory: 'adult' }) }),
    );
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', title: 'Image Flagged' }),
      }),
    );
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
});
