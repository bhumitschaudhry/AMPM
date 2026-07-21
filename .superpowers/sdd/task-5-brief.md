### Task 5: Add SigNoz monitoring and OpenTelemetry instrumentation

**Files:**
- Modify: `server/package.json`, `server/package-lock.json`
- Modify: `worker/package.json`, `worker/package-lock.json`
- Create: `server/src/telemetry.ts`
- Create: `server/src/__tests__/telemetry.test.ts`
- Create: `worker/src/telemetry.ts`
- Create: `worker/src/__tests__/telemetry.test.ts`
- Modify: `server/src/index.ts`
- Modify: `worker/src/index.ts`
- Create: `otel-collector-config.yaml`
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Produces OpenTelemetry OTLP trace and metric telemetry exported via `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME`.
- Exposes SigNoz OpenTelemetry Collector and SigNoz dashboard service in `docker-compose.yml`.

- [ ] **Step 1: Add OpenTelemetry dependencies.**

Run:
```powershell
Set-Location server
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http @opentelemetry/resources @opentelemetry/semantic-conventions @opentelemetry/sdk-metrics
Set-Location ../worker
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http @opentelemetry/resources @opentelemetry/semantic-conventions @opentelemetry/sdk-metrics
Set-Location ..
```

- [ ] **Step 2: Create telemetry modules for server and worker.**

Create `server/src/telemetry.ts` and `worker/src/telemetry.ts` initializing NodeSDK with OTLP exporters, auto-instrumentations, and graceful shutdown handling.

- [ ] **Step 3: Wire telemetry into application entrypoints.**

Import `telemetry` at the top of `server/src/index.ts` and `worker/src/index.ts`.

- [ ] **Step 4: Configure SigNoz service stack in docker-compose.yml.**

Add `signoz-otel-collector` and SigNoz monitoring services to `docker-compose.yml`. Configure `OTEL_SERVICE_NAME` and `OTEL_EXPORTER_OTLP_ENDPOINT` environment variables.

- [ ] **Step 5: Verify tests and build.**

Run:
```powershell
Set-Location server
npx vitest run src
Set-Location ../worker
npx vitest run src
Set-Location ..
```

- [ ] **Step 6: Commit.**

Commit all changes with clean message:
`feat: add SigNoz monitoring and OpenTelemetry instrumentation`
