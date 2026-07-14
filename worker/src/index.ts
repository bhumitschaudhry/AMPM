import 'dotenv/config';
import { worker } from './create-worker';

console.log('AMPM Worker started. Listening for image processing jobs...');

async function shutdown() {
  console.log('Shutting down worker...');
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
