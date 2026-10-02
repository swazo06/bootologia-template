import type { AppRole } from "@/lib/auth/roles";

export function isAuthBypassEnabled(): boolean {
  return (
    process.env.AUTH_BYPASS === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

export function getAuthBypassRole(): AppRole {
  const role = process.env.AUTH_BYPASS_ROLE;
  if (role === "VIEWER" || role === "EDITOR" || role === "ADMIN") {
    return role;
  }
  return "ADMIN";
}

export function getSupabasePublicConfig():
  | { url: string; anon: string }
  | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url, anon };
}
