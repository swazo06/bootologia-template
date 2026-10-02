import { createServerClient } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { AppRole } from "@/lib/auth/roles";
import {
  getAuthBypassRole,
  getSupabasePublicConfig,
  isAuthBypassEnabled,
} from "@/lib/auth/config";
import {
  assertRole,
  createMockAuthUser,
  getUserRole,
} from "@/providers/auth/mock-auth";

export {
  getSupabasePublicConfig,
  isAuthBypassEnabled,
} from "@/lib/auth/config";

export function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase admin configuration");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createSupabaseServerClient() {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error("AUTH_CONFIG_MISSING");
  }

  const cookieStore = await cookies();

  return createServerClient(config.url, config.anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — ignore.
        }
      },
    },
  });
}

export async function getSessionUser(): Promise<User | null> {
  if (isAuthBypassEnabled()) {
    return createMockAuthUser({
      role: getAuthBypassRole(),
    }) as User;
  }

  if (!getSupabasePublicConfig()) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export async function requireRole(allowed: readonly AppRole[]): Promise<User> {
  const user = await requireUser();
  assertRole(user, allowed);
  return user;
}

export { getUserRole };

export type AuthUser = Awaited<ReturnType<typeof requireUser>>;
