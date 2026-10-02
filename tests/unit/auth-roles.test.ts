import { describe, expect, it } from "vitest";
import {
  hasMinimumRole,
  hasRole,
  parseAppRole,
} from "@/lib/auth/roles";
import {
  assertRole,
  createMockAuthUser,
  getUserRole,
} from "@/providers/auth/mock-auth";

describe("auth-roles", () => {
  it("parses known roles and defaults to VIEWER", () => {
    expect(parseAppRole("ADMIN")).toBe("ADMIN");
    expect(parseAppRole("nope")).toBe("VIEWER");
  });

  it("reads role from app_metadata", () => {
    const user = createMockAuthUser({ role: "EDITOR" });
    expect(getUserRole(user)).toBe("EDITOR");
  });

  it("allows EDITOR for editor/admin gates", () => {
    expect(hasRole("EDITOR", ["EDITOR", "ADMIN"])).toBe(true);
    expect(hasRole("VIEWER", ["EDITOR", "ADMIN"])).toBe(false);
  });

  it("compares minimum role ranks", () => {
    expect(hasMinimumRole("ADMIN", "EDITOR")).toBe(true);
    expect(hasMinimumRole("VIEWER", "EDITOR")).toBe(false);
  });

  it("assertRole throws FORBIDDEN for viewers on editor actions", () => {
    const viewer = createMockAuthUser({ role: "VIEWER" });
    expect(() => assertRole(viewer, ["EDITOR", "ADMIN"])).toThrow("FORBIDDEN");
    expect(assertRole(createMockAuthUser({ role: "ADMIN" }), ["ADMIN"])).toBe(
      "ADMIN",
    );
  });
});
