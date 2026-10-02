import { afterEach, describe, expect, it } from "vitest";
import { signInAction } from "@/server/actions/auth";

describe("auth-actions", () => {
  const previous = { ...process.env };

  afterEach(() => {
    process.env = { ...previous };
  });

  it("rejects invalid login payloads", async () => {
    const result = await signInAction({
      email: "bad",
      password: "short",
    });
    expect(result).toEqual({ ok: false, error: "VALIDATION_REJECTED" });
  });

  it("accepts login when AUTH_BYPASS is enabled", async () => {
    process.env.AUTH_BYPASS = "true";
    const result = await signInAction({
      email: "editor@example.com",
      password: "password1",
    });
    expect(result).toEqual({ ok: true });
  });

  it("reports missing auth config when supabase env is absent", async () => {
    process.env.AUTH_BYPASS = "false";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const result = await signInAction({
      email: "editor@example.com",
      password: "password1",
    });
    expect(result).toEqual({ ok: false, error: "AUTH_CONFIG_MISSING" });
  });
});
