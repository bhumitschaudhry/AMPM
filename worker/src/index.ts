import './telemetry';
import 'dotenv/config';
import { worker } from './create-worker';

console.log('AMPM Worker started. Listening for image processing jobs...');

async function shutdown() {
  console.log('Shutting down worker...');
  await worker.close();
  process.exit(0);
}

// Keep transient Redis or queue failures visible while BullMQ reconnects.
process.on('unhandledRejection', (reason) => {
  console.error('[ERROR] Unhandled worker rejection; BullMQ will continue retrying:', reason);
});

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
