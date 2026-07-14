import 'dotenv/config';
import { startWorker, getWorker } from './create-worker';

const worker = startWorker();
console.log('AMPM Worker started. Listening for image processing jobs...');

async function shutdown() {
  console.log('Shutting down worker...');
  const currentWorker = getWorker();
  if (currentWorker) {
    await currentWorker.close();
  }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
