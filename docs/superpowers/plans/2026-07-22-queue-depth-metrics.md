# Queue Depth Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit BullMQ `image-processing` queue depth (waiting/active/delayed) as an OpenTelemetry `UpDownCounter` from the server so it appears in SigNoz.

**Architecture:** A new `server/src/queue-metrics.ts` module polls `imageQueue.getJobCounts()` on a `setInterval`, recording the delta into an `ampm.queue.depth` `UpDownCounter` on the existing `ampm-server` meter. Telemetry bootstrap auto-starts the poller when telemetry is enabled. Shutdown clears the interval.

**Tech Stack:** TypeScript, Node.js, BullMQ, `@opentelemetry/api`, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-22-queue-depth-metrics-design.md`

---

## File Structure

- **Create:** `server/src/queue-metrics.ts` — owns the UpDownCounter and the polling interval. Exports `startQueueDepthMetrics()` and `stopQueueDepthMetrics()`.
- **Create:** `server/src/__tests__/queue-metrics.test.ts` — unit tests for the poller.
- **Modify:** `server/src/telemetry.ts` — call `startQueueDepthMetrics()` from the auto-init block.
- **Modify:** `server/src/index.ts` — call `stopQueueDepthMetrics()` from SIGTERM/SIGINT handlers.
- **Modify:** `.env.example` — document `QUEUE_DEPTH_METRICS_ENABLED` and `QUEUE_DEPTH_POLL_INTERVAL_MS`.

---

## Task 1: Add failing tests for the queue metrics poller

**Files:**
- Create: `server/src/__tests__/queue-metrics.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/__tests__/queue-metrics.test.ts` with the following content:

```ts
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

    // Tick 1: baseline (5,2,0)
    expect(counter.add).toHaveBeenCalledWith(5, { state: 'waiting' });
    expect(counter.add).toHaveBeenCalledWith(2, { state: 'active' });
    expect(counter.add).toHaveBeenCalledWith(0, { state: 'delayed' });
    // Tick 2: +2 waiting, -1 active, +3 delayed
    expect(counter.add).toHaveBeenCalledWith(2, { state: 'waiting' });
    expect(counter.add).toHaveBeenCalledWith(-1, { state: 'active' });
    expect(counter.add).toHaveBeenCalledWith(3, { state: 'delayed' });
    // Tick 3: -1 waiting, +3 active, -2 delayed
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
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('queue depth metrics'));
    warn.mockRestore();
  });

  it('clears the interval on stop', async () => {
    startQueueDepthMetrics();
    stopQueueDepthMetrics();
    await vi.advanceTimersByTimeAsync(5000);
    expect(imageQueue.getJobCounts).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npm test -- src/__tests__/queue-metrics.test.ts`
Expected: FAIL — `queue-metrics` module does not exist (`Failed to resolve import "../queue-metrics"`).

---

## Task 2: Implement the queue metrics poller

**Files:**
- Create: `server/src/queue-metrics.ts`

- [ ] **Step 1: Implement `server/src/queue-metrics.ts`**

Create the file with the following content:

```ts
import { metrics } from '@opentelemetry/api';
import { imageQueue } from './queue';

const TRACKED_STATES = ['waiting', 'active', 'delayed'] as const;
type TrackedState = (typeof TRACKED_STATES)[number];

const queueDepthCounter = metrics
  .getMeter('ampm-server')
  .createUpDownCounter('ampm.queue.depth', {
    description: 'Number of image-processing jobs in the BullMQ queue, segmented by state.',
    unit: '1',
  });

let intervalHandle: NodeJS.Timeout | null = null;
let previousCounts: Record<TrackedState, number> = {
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
  const intervalMs = parseInt(process.env.QUEUE_DEPTH_POLL_INTERVAL_MS || '10000', 10);
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
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `cd server && npm test -- src/__tests__/queue-metrics.test.ts`
Expected: PASS — all four tests green.

- [ ] **Step 3: Run typecheck**

Run: `cd server && npm run typecheck`
Expected: PASS — no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/queue-metrics.ts server/src/__tests__/queue-metrics.test.ts
git commit -m "feat(server): add queue depth metrics poller

Adds ampm.queue.depth UpDownCounter that polls
imageQueue.getJobCounts() on a configurable interval so backlog,
in-flight, and retry-backoff job counts surface in SigNoz."

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>
```

---

## Task 3: Wire the poller into telemetry bootstrap and server shutdown

**Files:**
- Modify: `server/src/telemetry.ts:88-97` (the trailing auto-init block)
- Modify: `server/src/index.ts:1-13` (top of file imports / process boot)

- [ ] **Step 1: Update `server/src/telemetry.ts` to auto-start the poller**

Edit the trailing block (currently lines 88-97):

```ts
if (process.env.NODE_ENV !== "test" && process.env.OTEL_SDK_DISABLED !== "true") {
  initTelemetry();
}
```

Replace it with:

```ts
if (process.env.NODE_ENV !== "test" && process.env.OTEL_SDK_DISABLED !== "true") {
  initTelemetry();
  if (process.env.QUEUE_DEPTH_METRICS_ENABLED !== "false") {
    startQueueDepthMetrics();
  }
}
```

Also add this import at the top with the other imports:

```ts
import { startQueueDepthMetrics } from "./queue-metrics";
```

- [ ] **Step 2: Add graceful shutdown handlers in `server/src/index.ts`**

Add the import alongside the other imports (after the `helmet` import block, near `sanitizeInput`):

```ts
import { stopQueueDepthMetrics } from './queue-metrics';
```

At the end of the file, after `app.listen(PORT, ...)`, append:

```ts
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`[server] Received ${signal}, shutting down gracefully`);
    stopQueueDepthMetrics();
    process.exit(0);
  });
}
```

- [ ] **Step 3: Run typecheck**

Run: `cd server && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run the full server test suite**

Run: `cd server && npm test`
Expected: PASS — all tests, including the new `queue-metrics.test.ts`, green.

- [ ] **Step 5: Commit**

```bash
git add server/src/telemetry.ts server/src/index.ts
git commit -m "feat(server): wire queue depth poller into lifecycle

Starts the poller after telemetry init and clears its interval on
SIGTERM/SIGINT so the server can shut down promptly."

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>
```

---

## Task 4: Document env vars and verify end-to-end

**Files:**
- Modify: `.env.example:62-64` (the trailing SigNoz block)

- [ ] **Step 1: Append the new env vars to `.env.example`**

Edit the trailing SigNoz block so it reads:

```
# SigNoz / OpenTelemetry Monitoring
OTEL_SERVICE_NAME=ampm-service
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SDK_DISABLED=false

# Queue depth metrics
# Polls imageQueue.getJobCounts() and exports the result as ampm.queue.depth.
# Set QUEUE_DEPTH_METRICS_ENABLED=false to disable without code changes.
QUEUE_DEPTH_METRICS_ENABLED=true
QUEUE_DEPTH_POLL_INTERVAL_MS=10000
```

- [ ] **Step 2: Run typecheck and tests one final time**

Run: `cd server && npm run typecheck && npm test`
Expected: PASS on both.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs(env): document queue depth metric env vars

Adds QUEUE_DEPTH_METRICS_ENABLED and QUEUE_DEPTH_POLL_INTERVAL_MS
alongside the existing OpenTelemetry settings."

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>
```

- [ ] **Step 4: Push the branch**

```bash
git push origin main
```

---

## Self-Review Notes

- **Spec coverage:**
  - New `server/src/queue-metrics.ts` → Task 2 ✓
  - Auto-start from telemetry → Task 3 ✓
  - Shutdown handler → Task 3 ✓
  - Env vars documented → Task 4 ✓
  - Unit tests for all four error/control states → Task 1 ✓
  - `ampm.queue.depth` `UpDownCounter` with `{state}` attribute and `unit: "1"` → Task 2 ✓
- **Placeholder scan:** No TBDs, TODOs, "implement later", or hand-wavy "add error handling" steps. Every step shows concrete code.
- **Type consistency:** `startQueueDepthMetrics` / `stopQueueDepthMetrics` referenced consistently in Task 1 (imports), Task 2 (definitions), Task 3 (call sites). Meter name `ampm-server` matches the existing `server/src/telemetry.ts:12`. Counter name `ampm.queue.depth` and attribute `state` referenced uniformly.
