import { describe, expect, it } from "vitest";
import { loginSchema } from "@/lib/validation/auth";

describe("auth-schemas", () => {
  it("accepts a valid login payload", () => {
    const parsed = loginSchema.parse({
      email: "editor@example.com",
      password: "password1",
    });
    expect(parsed.email).toBe("editor@example.com");
  });

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "password1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short passwords", () => {
    const result = loginSchema.safeParse({
      email: "editor@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });
});
