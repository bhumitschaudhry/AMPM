import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { metrics } from "@opentelemetry/api";

let sdk: NodeSDK | null = null;

const meter = metrics.getMeter("ampm-server");

export const tokenAnalysisCounter = meter.createCounter("auth_tokens_analyzed_total", {
  description: "Total number of authentication tokens analyzed/validated",
});

export const tokenIssueCounter = meter.createCounter("auth_tokens_issued_total", {
  description: "Total number of authentication tokens issued",
});

export const tokenFailureCounter = meter.createCounter("auth_tokens_failed_total", {
  description: "Total number of failed token validations",
});

export const tokenDurationHistogram = meter.createHistogram("auth_token_analysis_duration_ms", {
  description: "Duration of token analysis/validation in milliseconds",
  unit: "ms",
});

export function recordTokenAnalysis(
  type: "jwt" | "google_oauth" | "refresh",
  isSuccess: boolean,
  durationMs: number
): void {
  const status = isSuccess ? "success" : "failure";
  tokenAnalysisCounter.add(1, { token_type: type, status });
  if (!isSuccess) {
    tokenFailureCounter.add(1, { token_type: type });
  }
  tokenDurationHistogram.record(durationMs, { token_type: type, status });
}

export function recordTokenIssuance(type: "access" | "refresh"): void {
  tokenIssueCounter.add(1, { token_type: type });
}

export function initTelemetry(customServiceName?: string): NodeSDK | null {
  if (process.env.OTEL_SDK_DISABLED === "true") {
    return null;
  }

  if (sdk) {
    return sdk;
  }

  const serviceName = customServiceName || process.env.OTEL_SERVICE_NAME || "ampm-server";
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://signoz-otel-collector:4318";

  const traceExporter = new OTLPTraceExporter({
    url: `${otlpEndpoint.replace(/\/$/, "")}/v1/traces`,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${otlpEndpoint.replace(/\/$/, "")}/v1/metrics`,
  });

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 5000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  try {
    sdk.start();
    console.log(`[Telemetry] OpenTelemetry initialized for ${serviceName} -> ${otlpEndpoint}`);
  } catch (error) {
    console.error("[Telemetry] Failed to start OpenTelemetry SDK:", error);
  }

  return sdk;
}

if (process.env.NODE_ENV !== "test" && process.env.OTEL_SDK_DISABLED !== "true") {
  initTelemetry();
}
