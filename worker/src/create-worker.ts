import { Worker } from 'bullmq';
import { processImage } from './process-image';

// NOTE: must match IMAGE_QUEUE_NAME in server/src/queue.ts — there is no shared
// package yet (see docs/adr/0001-architecture-decisions.md). Keep both in sync.
const QUEUE_NAME = 'image-processing';
const CONCURRENCY = 3;

// Build a BullMQ connection from a managed Redis URL or local host/port settings.
function createRedisConnection() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      maxRetriesPerRequest: null as null,
    };
  }

  const parsedUrl = new URL(redisUrl);
  return {
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port || 6379),
    username: parsedUrl.username || undefined,
    password: parsedUrl.password || undefined,
    ...(parsedUrl.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null as null,
  };
}

const redisConnection = createRedisConnection();

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
