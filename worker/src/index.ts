import 'dotenv/config';
import { worker } from './create-worker';

console.log('AMPM Worker started. Listening for image processing jobs...');

async function shutdown() {
  console.log('Shutting down worker...');
  await worker.close();
  process.exit(0);
}

// Log unhandled rejections (e.g. Redis connection failures) before Node exits.
// Without this the process silently exits with code 1 and the error is invisible in logs.
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection — worker is shutting down:', reason);
  process.exit(1);
});

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
