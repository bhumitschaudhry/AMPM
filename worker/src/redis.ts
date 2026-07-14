// Re-export the raw connection config so BullMQ can create its own IORedis instance,
// avoiding version conflicts between top-level ioredis and BullMQ's bundled copy.
const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null as null,
};

export default redisConnection;
