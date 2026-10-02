import { z } from "zod";
import { appRoleSchema, loginSchema } from "@/lib/auth/roles";

export { appRoleSchema, loginSchema };
export type { AppRole, LoginInput } from "@/lib/auth/roles";

export const authErrorSchema = z.enum([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "INVALID_CREDENTIALS",
  "AUTH_CONFIG_MISSING",
  "VALIDATION_REJECTED",
]);

export type AuthErrorCode = z.infer<typeof authErrorSchema>;
