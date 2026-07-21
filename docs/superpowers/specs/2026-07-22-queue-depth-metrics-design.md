# Queue Depth Metrics in SigNoz — Design

**Status:** Approved
**Date:** 2026-07-22
**Scope:** Add BullMQ queue depth visibility to the existing OpenTelemetry / SigNoz monitoring stack.

## Goal

Surface the depth of the `image-processing` BullMQ queue in SigNoz so operators can see backlog (`waiting`), in-flight work (`active`), and retry backlog (`delayed`) in real time.

## Non-Goals

- Throughput counters (jobs completed / failed over time) and per-job duration histograms. These would need event-driven instrumentation (`QueueEvents`) and were not requested.
- Metrics for `failed` or `completed` job counts. Not requested.
- SigNoz dashboard JSON, saved views, or alerting rules. Operational concern for a later change.
- Any changes to the worker process. Queue depth is sourced from the producer side.
- A generic, multi-queue metrics framework. Single queue today; design supports extension later but does not build it now.

## Context

- **Queue library:** BullMQ v5.34.0 (resolved to 5.80.2 in the lockfile).
- **Queue name:** `image-processing` — defined in `server/src/queue.ts`, consumed by `worker/src/create-worker.ts`.
- **OpenTelemetry SDK:** Already initialized in both `server/src/telemetry.ts` and `worker/src/telemetry.ts` with `PeriodicExportingMetricReader` exporting over OTLP HTTP every 5 seconds.
- **SigNoz collector:** Running in `docker-compose.yml`; exposes OTLP on `4317` (gRPC) and `4318` (HTTP). Currently configured with a `debug` exporter (stdout); the same OTLP pipeline will route to a SigNoz backend once it is wired.
- **Existing custom metrics in server:** Auth-token counters and a duration histogram, all on the `ampm-server` meter. No queue-related metrics exist today.

## Architecture

A small new module in the **server** owns the periodic poller. The server is the natural home because it already owns `imageQueue` (the producer) and runs the OTel SDK. The worker needs no changes — it consumes the same Redis-backed queue, so depth visible from the producer is authoritative.

The poller uses a synchronous `UpDownCounter` that we set on every tick by recording the delta from the previous tick. This is the idiomatic OTel pattern for "absolute external count" and integrates cleanly with the existing `PeriodicExportingMetricReader` (5s flush).

### Data flow

```
setInterval(10s, configurable via QUEUE_DEPTH_POLL_INTERVAL_MS)
   └── imageQueue.getJobCounts()
        └── { waiting, active, delayed, failed, completed, paused }
             └── counter.add(delta, { state })
                       ↓
             PeriodicExportingMetricReader (5s)
                       ↓
             OTLP HTTP → signoz-otel-collector:4318/v1/metrics
                       ↓
             SigNoz
```

## Components

### 1. `server/src/queue-metrics.ts` (new)

Creates the `ampm.queue.depth` `UpDownCounter` on the existing `ampm-server` meter. Exports two functions:

- `startQueueDepthMetrics()` — registers the poller. Reads `QUEUE_DEPTH_METRICS_ENABLED` (default `"true"`) and `QUEUE_DEPTH_POLL_INTERVAL_MS` (default `10000`). Returns immediately when telemetry is disabled.
- `stopQueueDepthMetrics()` — clears the interval. Safe to call multiple times.

Each tick:
1. Calls `imageQueue.getJobCounts()`.
2. For each tracked state (`waiting`, `active`, `delayed`):
   - Computes `delta = currentCount - previousCount[state]`.
   - Calls `counter.add(delta, { state })`.
3. Stores current counts in `previousCount` for the next tick.
4. On error, logs a warning via `console.warn` and skips the tick — never throws.

### 2. `server/src/telemetry.ts` (modified)

After `initTelemetry()` returns successfully, calls `startQueueDepthMetrics()` when `OTEL_SDK_DISABLED !== "true"` and `QUEUE_DEPTH_METRICS_ENABLED !== "false"`. The existing `customServiceName` / `OTEL_SERVICE_NAME` flow is unchanged.

### 3. `server/src/server.ts` (modified)

Adds a `SIGTERM` and `SIGINT` handler that calls `stopQueueDepthMetrics()` before the existing shutdown sequence so the interval doesn't keep the process alive.

### 4. `.env.example` (modified)

Documents the two new variables:

```
# Queue depth metrics (SigNoz)
QUEUE_DEPTH_METRICS_ENABLED=true
QUEUE_DEPTH_POLL_INTERVAL_MS=10000
```

### 5. `server/src/__tests__/queue-metrics.test.ts` (new)

- Mocks `imageQueue.getJobCounts` to return known counts across multiple ticks.
- Advances fake timers and asserts the counter receives the expected `(delta, { state })` records.
- Asserts no call to `getJobCounts` when `QUEUE_DEPTH_METRICS_ENABLED=false`.
- Asserts an error from `getJobCounts` does not throw out of the tick and does not stop subsequent ticks.

## Metric Definition

- **Name:** `ampm.queue.depth`
- **Type:** `UpDownCounter` (synchronous)
- **Unit:** `1`
- **Description:** "Number of image-processing jobs in the BullMQ queue, segmented by state."
- **Attributes:** `state` ∈ `{waiting, active, delayed}`

Rationale for `UpDownCounter` over `ObservableGauge`: OTel `ObservableGauge` callbacks are invoked by the SDK at export time and need to call a `result.observe(value)` synchronously inside the callback. With a periodic poller we already have the cadence, and the explicit delta-add pattern makes the tick boundary clear in dashboards (the value is the cumulative delta, not a snapshot).

## Error Handling

- `getJobCounts()` throws → log warning, skip tick, keep polling.
- Telemetry disabled at startup → `startQueueDepthMetrics` is a no-op.
- `stopQueueDepthMetrics()` called before `startQueueDepthMetrics` → no-op.
- `stopQueueDepthMetrics()` called twice → no-op (interval already cleared).

## Testing Strategy

Unit tests in `server/src/__tests__/queue-metrics.test.ts` cover:

1. Three consecutive ticks with varying counts produce the expected deltas (positive, negative, zero).
2. Disabling via `QUEUE_DEPTH_METRICS_ENABLED=false` prevents `getJobCounts` calls.
3. A throwing `getJobCounts` does not stop the interval and does not throw out.
4. `stopQueueDepthMetrics` after `startQueueDepthMetrics` clears the interval (verified via `vi.getTimerCount()` or equivalent).

No integration test against a live Redis — the poller is small, deterministic, and fully mockable.

## Rollout

- Feature flag-gated by env var (`QUEUE_DEPTH_METRICS_ENABLED`).
- Default-on in dev and prod. In tests, the existing `NODE_ENV=test` short-circuit in `telemetry.ts` already prevents the SDK from starting, so the poller is not registered at all in test runs.
- No migration; no DB changes.

## Open Questions

None at design time.
