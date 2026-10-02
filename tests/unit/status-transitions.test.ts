import { describe, expect, it } from "vitest";
import {
  canTransition,
  assertTransition,
} from "@/lib/validation/status-transitions";

describe("status-transitions", () => {
  it("allows REVIEW -> APPROVED", () => {
    expect(canTransition("REVIEW", "APPROVED")).toBe(true);
  });

  it("rejects DRAFT -> PUBLISHED", () => {
    expect(canTransition("DRAFT", "PUBLISHED")).toBe(false);
    expect(() => assertTransition("DRAFT", "PUBLISHED")).toThrow(
      /Invalid status transition/,
    );
  });

  it("marks PUBLISHED as terminal", () => {
    expect(canTransition("PUBLISHED", "APPROVED")).toBe(false);
    expect(canTransition("PUBLISHED", "SCHEDULED")).toBe(false);
  });

  it("does not allow APPROVED or SCHEDULED to jump directly to PUBLISHED", () => {
    expect(canTransition("APPROVED", "PUBLISHED")).toBe(false);
    expect(canTransition("SCHEDULED", "PUBLISHED")).toBe(false);
    expect(canTransition("PROCESSING", "PUBLISHED")).toBe(true);
  });
});
