"use server";

import { redirect } from "next/navigation";
import { loginSchema } from "@/lib/validation/auth";
import {
  createSupabaseServerClient,
  isAuthBypassEnabled,
} from "@/lib/auth/supabase";

export type AuthActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function signInAction(
  raw: unknown,
): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_REJECTED" };
  }

  if (isAuthBypassEnabled()) {
    return { ok: true };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error) {
      return { ok: false, error: "INVALID_CREDENTIALS" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "AUTH_CONFIG_MISSING" };
  }
}

export async function signOutAction(): Promise<void> {
  if (!isAuthBypassEnabled()) {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    } catch {
      // Ignore missing config on sign-out.
    }
  }
  redirect("/login");
}
