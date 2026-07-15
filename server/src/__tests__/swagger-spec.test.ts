import { describe, expect, it } from "vitest";
import { swaggerSpec } from "../routes/swagger-spec";

describe("swagger authentication documentation", () => {
  it("does not advertise Clerk authentication", () => {
    expect(swaggerSpec.components.securitySchemes).not.toHaveProperty("ClerkBearerAuth");
    expect(swaggerSpec.paths).not.toHaveProperty("/auth/clerk");
  });
});
