import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../queue', () => ({
  imageQueue: {
    getJobCounts: vi.fn(),
  },
}));

vi.mock('@opentelemetry/api', () => {
  const add = vi.fn();
  const counter = { add };
  const meter = { createUpDownCounter: vi.fn(() => counter) };
  return {
    metrics: {
      getMeter: vi.fn(() => meter),
    },
  };
});

import { imageQueue } from '../queue';
import { startQueueDepthMetrics, stopQueueDepthMetrics } from '../queue-metrics';

describe('queue depth metrics poller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('QUEUE_DEPTH_METRICS_ENABLED', 'true');
    vi.stubEnv('QUEUE_DEPTH_POLL_INTERVAL_MS', '1000');
    vi.mocked(imageQueue.getJobCounts).mockReset();
  });

  afterEach(() => {
    stopQueueDepthMetrics();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('does not start when QUEUE_DEPTH_METRICS_ENABLED=false', async () => {
    vi.stubEnv('QUEUE_DEPTH_METRICS_ENABLED', 'false');
    startQueueDepthMetrics();
    await vi.advanceTimersByTimeAsync(5000);
    expect(imageQueue.getJobCounts).not.toHaveBeenCalled();
  });

  it('records positive and negative deltas across ticks', async () => {
    const { metrics } = await import('@opentelemetry/api');
    const meter = metrics.getMeter('ampm-server');
    const counter = meter.createUpDownCounter('ampm.queue.depth');

    vi.mocked(imageQueue.getJobCounts)
      .mockResolvedValueOnce({ waiting: 5, active: 2, delayed: 0, failed: 0, completed: 0, paused: 0 } as never)
      .mockResolvedValueOnce({ waiting: 7, active: 1, delayed: 3, failed: 0, completed: 0, paused: 0 } as never)
      .mockResolvedValueOnce({ waiting: 6, active: 4, delayed: 1, failed: 0, completed: 0, paused: 0 } as never);

    startQueueDepthMetrics();
    await vi.advanceTimersByTimeAsync(3000);

    expect(counter.add).toHaveBeenCalledWith(5, { state: 'waiting' });
    expect(counter.add).toHaveBeenCalledWith(2, { state: 'active' });
    // Zero deltas are intentionally not emitted by the implementation to avoid
    // spamming the counter on every tick.
    expect(counter.add).not.toHaveBeenCalledWith(0, { state: 'delayed' });
    expect(counter.add).toHaveBeenCalledWith(2, { state: 'waiting' });
    expect(counter.add).toHaveBeenCalledWith(-1, { state: 'active' });
    expect(counter.add).toHaveBeenCalledWith(3, { state: 'delayed' });
    expect(counter.add).toHaveBeenCalledWith(-1, { state: 'waiting' });
    expect(counter.add).toHaveBeenCalledWith(3, { state: 'active' });
    expect(counter.add).toHaveBeenCalledWith(-2, { state: 'delayed' });
  });

  it('keeps polling after getJobCounts throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(imageQueue.getJobCounts)
      .mockRejectedValueOnce(new Error('redis down'))
      .mockResolvedValueOnce({ waiting: 1, active: 0, delayed: 0, failed: 0, completed: 0, paused: 0 } as never);

    startQueueDepthMetrics();
    await vi.advanceTimersByTimeAsync(2000);

    expect(imageQueue.getJobCounts).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('queue-metrics'));
    warn.mockRestore();
  });

  it('clears the interval on stop', async () => {
    startQueueDepthMetrics();
    stopQueueDepthMetrics();
    await vi.advanceTimersByTimeAsync(5000);
    expect(imageQueue.getJobCounts).not.toHaveBeenCalled();
  });
});
