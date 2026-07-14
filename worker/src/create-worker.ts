import { Worker } from 'bullmq';
import { processImage } from './process-image';

// NOTE: must match IMAGE_QUEUE_NAME in server/src/queue.ts — there is no shared
// package yet (see docs/adr/0001-architecture-decisions.md). Keep both in sync.
const QUEUE_NAME = 'image-processing';
const CONCURRENCY = 3;

// Re-export the raw connection config so BullMQ can create its own IORedis instance,
// avoiding version conflicts between top-level ioredis and BullMQ's bundled copy.
const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null as null,
};

/** BullMQ worker that runs the AI pipeline on each image-processing job. */
export const worker: Worker = new Worker(QUEUE_NAME, processImage, {
  connection: redisConnection,
  concurrency: CONCURRENCY,
});

worker.on('completed', (job) => {
  console.log(`[COMPLETED] Job ${job.id} — image ${job.data.imageId} processed successfully.`);
});

worker.on('failed', (job, error) => {
  console.error(`[FAILED] Job ${job?.id} — ${error.message}`);
});
