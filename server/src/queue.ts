import { Queue } from "bullmq";
import redisConnection from "./redis";

/** Queue name for image processing jobs. */
export const IMAGE_QUEUE_NAME = "image-processing";

/** BullMQ queue for enqueuing image processing tasks. */
export const imageQueue = new Queue(IMAGE_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: parseInt(process.env.MAX_RETRIES || "3", 10),
    backoff: {
      type: "exponential",
      delay: parseInt(process.env.RETRY_DELAY_MS || "5000", 10),
    },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});
