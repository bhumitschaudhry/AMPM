import { describe, it, expect, vi } from "vitest";
import { initTelemetry, recordAiTokenAnalysis } from "../telemetry";

describe("worker telemetry", () => {
  it("returns null when OTEL_SDK_DISABLED is true", () => {
    vi.stubEnv("OTEL_SDK_DISABLED", "true");
    const result = initTelemetry("test-worker");
    expect(result).toBeNull();
    vi.unstubAllEnvs();
  });

  it("records AI token analysis payload without throwing", () => {
    expect(() => {
      recordAiTokenAnalysis({
        provider: "huggingface",
        model: "blip-image-captioning-base",
        task: "captioning",
        promptTokens: 120,
        completionTokens: 15,
        durationMs: 450,
        isSuccess: true,
      });

      recordAiTokenAnalysis({
        provider: "google_vision",
        model: "safeSearchDetection",
        task: "content_safety",
        promptTokens: 80,
        completionTokens: 5,
        durationMs: 220,
        isSuccess: false,
      });
    }).not.toThrow();
  });
});
