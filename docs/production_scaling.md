# Production Scaling Recommendations

This document outlines key strategies and architectural transitions for scaling the **AMPM** media processing pipeline under high load.

---

## Worker Scaling

- **Horizontal Scaling**: Spin up additional replicas of the `worker` process. BullMQ coordinates atomic task lock distribution automatically, ensuring that no two workers process the same task.
- **Concurrency Control**: Adjust the concurrency setting in the worker configuration (default: 3 concurrent jobs per process) to optimize resource usage based on cpu and memory availability.

## Distributed Storage

- **S3-Compatible Storage**: Swap out local volume mounts with a distributed, high-availability object storage provider like Cloudflare R2, AWS S3, or Google Cloud Storage.
- **Valkey / Redis Clustering**: Move from a single Upstash instance to a clustered Redis setup or a managed service (e.g., AWS ElastiCache) for low-latency state coordination and high throughput queueing.

## Database Optimization

- **Connection Pooling**: Always route API and worker database connections through a pooler (e.g. Neon connection pooler or PgBouncer) to prevent database exhaustion under high concurrent load.
- **Read Replicas**: Separate heavy read queries (e.g., listing all jobs and images) from transaction-heavy writes by directing reads to PostgreSQL read-replicas.
