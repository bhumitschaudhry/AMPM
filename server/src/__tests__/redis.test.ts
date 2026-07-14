import { describe, it, expect } from "vitest";

describe("redis config", () => {
  it("exports connection config with defaults", async () => {
    // Clear any env overrides
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;

    const redisConfig = (await import("../redis")).default;
    expect(redisConfig.host).toBe("localhost");
    expect(redisConfig.port).toBe(6379);
    expect(redisConfig.maxRetriesPerRequest).toBeNull();
  });
});
