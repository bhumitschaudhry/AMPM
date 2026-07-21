import { metrics } from '@opentelemetry/api';
import { imageQueue } from './queue';

const TRACKED_STATES = ['waiting', 'active', 'delayed'] as const;
type TrackedState = (typeof TRACKED_STATES)[number];

const queueDepthCounter = metrics.getMeter('ampm-server').createUpDownCounter('ampm.queue.depth', {
  description: 'Number of image-processing jobs in the BullMQ queue, segmented by state.',
  unit: '1',
});

let intervalHandle: NodeJS.Timeout | null = null;
const previousCounts: Record<TrackedState, number> = {
  waiting: 0,
  active: 0,
  delayed: 0,
};

async function tick(): Promise<void> {
  try {
    const counts = await imageQueue.getJobCounts();
    for (const state of TRACKED_STATES) {
      const current = counts[state] ?? 0;
      const delta = current - previousCounts[state];
      if (delta !== 0) {
        queueDepthCounter.add(delta, { state });
      }
      previousCounts[state] = current;
    }
  } catch (error) {
    console.warn(
      `[queue-metrics] Failed to poll queue depth: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function startQueueDepthMetrics(): void {
  if (intervalHandle) {
    return;
  }
  if (process.env.QUEUE_DEPTH_METRICS_ENABLED === 'false') {
    return;
  }
  const intervalMs = Number.parseInt(process.env.QUEUE_DEPTH_POLL_INTERVAL_MS || '10000', 10);
  if (Number.isNaN(intervalMs) || intervalMs <= 0) {
    console.warn('[queue-metrics] Invalid QUEUE_DEPTH_POLL_INTERVAL_MS; using 10000');
  }
  const safeInterval = Number.isNaN(intervalMs) || intervalMs <= 0 ? 10000 : intervalMs;
  intervalHandle = setInterval(() => {
    void tick();
  }, safeInterval);
}

export function stopQueueDepthMetrics(): void {
  if (!intervalHandle) {
    return;
  }
  clearInterval(intervalHandle);
  intervalHandle = null;
}
