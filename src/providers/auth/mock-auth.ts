import type { User } from "@supabase/supabase-js";
import {
  type AppRole,
  hasRole,
  parseAppRole,
} from "@/lib/auth/roles";

export type AuthUserLike = Pick<User, "id" | "email" | "app_metadata" | "user_metadata">;

export function getUserRole(user: AuthUserLike): AppRole {
  return parseAppRole(user.app_metadata?.role);
}

export function assertRole(
  user: AuthUserLike,
  allowed: readonly AppRole[],
): AppRole {
  const role = getUserRole(user);
  if (!hasRole(role, allowed)) {
    throw new Error("FORBIDDEN");
  }
  return role;
}

export function createMockAuthUser(input?: {
  id?: string;
  email?: string;
  role?: AppRole;
}): AuthUserLike {
  return {
    id: input?.id ?? "user_mock_1",
    email: input?.email ?? "editor@example.com",
    app_metadata: { role: input?.role ?? "EDITOR" },
    user_metadata: {},
  };
}
