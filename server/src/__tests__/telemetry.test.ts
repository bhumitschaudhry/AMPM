import { describe, it, expect, vi } from "vitest";
import { initTelemetry, recordTokenAnalysis, recordTokenIssuance } from "../telemetry";

describe("server telemetry", () => {
  it("returns null when OTEL_SDK_DISABLED is true", () => {
    vi.stubEnv("OTEL_SDK_DISABLED", "true");
    const result = initTelemetry("test-server");
    expect(result).toBeNull();
    vi.unstubAllEnvs();
  });

  it("records token analysis and token issuance without throwing", () => {
    expect(() => {
      recordTokenAnalysis("jwt", true, 12);
      recordTokenAnalysis("google_oauth", false, 45);
      recordTokenIssuance("access");
      recordTokenIssuance("refresh");
    }).not.toThrow();
  });
});
