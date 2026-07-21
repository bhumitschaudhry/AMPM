import { describe, it, expect, vi } from "vitest";
import { initTelemetry, recordAiTokenAnalysis, recordBlipTokenAnalysis } from "../telemetry";

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

  it("records BLIP model specific token analysis payload without throwing", () => {
    const fakeImageBuffer = Buffer.from("test image buffer data content for blip model test");
    expect(() => {
      recordBlipTokenAnalysis({
        imageBuffer: fakeImageBuffer,
        caption: "a photo of a cat resting on a soft blanket",
        durationMs: 850,
        isSuccess: true,
      });

      recordBlipTokenAnalysis({
        imageBuffer: fakeImageBuffer,
        durationMs: 1200,
        isSuccess: false,
      });
    }).not.toThrow();
  });
});
