import { Worker } from 'bullmq';
import redisConnection from './redis';
import { processImage } from './process-image';

const QUEUE_NAME = 'image-processing';
const CONCURRENCY = 3;

let worker: Worker | null = null;

/** Create the BullMQ worker and attach lifecycle event listeners. */
export function startWorker(): Worker {
  worker = new Worker(QUEUE_NAME, processImage, {
    connection: redisConnection,
    concurrency: CONCURRENCY,
  });

  worker.on('completed', (job) => {
    console.log(`[COMPLETED] Job ${job.id} — image ${job.data.imageId} processed successfully.`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[FAILED] Job ${job?.id} — ${error.message}`);
  });

  return worker;
}

/** Return the current worker instance for graceful shutdown. */
export function getWorker(): Worker | null {
  return worker;
}
