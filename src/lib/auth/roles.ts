import { z } from "zod";

export const APP_ROLES = ["VIEWER", "EDITOR", "ADMIN"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const appRoleSchema = z.enum(APP_ROLES);

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const ROLE_RANK: Record<AppRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  ADMIN: 3,
};

export function hasRole(
  userRole: AppRole,
  allowed: readonly AppRole[],
): boolean {
  return allowed.includes(userRole);
}

export function hasMinimumRole(
  userRole: AppRole,
  minimum: AppRole,
): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[minimum];
}

export function parseAppRole(value: unknown): AppRole {
  const parsed = appRoleSchema.safeParse(value);
  return parsed.success ? parsed.data : "VIEWER";
}
