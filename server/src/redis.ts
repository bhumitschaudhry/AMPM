// Build a BullMQ connection from a managed Redis URL or local host/port settings.
function createRedisConnection() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
      maxRetriesPerRequest: null as null,
    };
  }

  const parsedUrl = new URL(redisUrl);
  return {
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port || 6379),
    username: parsedUrl.username || undefined,
    password: parsedUrl.password || undefined,
    ...(parsedUrl.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: null as null,
  };
}

// Re-export the raw config so BullMQ creates its own compatible IORedis instance.
const redisConnection = createRedisConnection();

export default redisConnection;

