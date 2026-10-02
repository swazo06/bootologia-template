import { z } from "zod";

export const socialAccountCreateSchema = z
  .object({
    platform: z.enum(["FACEBOOK", "INSTAGRAM"]),
    externalId: z.string().min(1).max(128),
    displayName: z.string().min(1).max(200),
    accessToken: z.string().min(10).max(4096),
    tokenExpiresAt: z.string().datetime().nullable().optional(),
    brandId: z.string().min(1).nullable().optional(),
    status: z
      .enum(["CONNECTED", "DISCONNECTED", "EXPIRED"])
      .optional()
      .default("CONNECTED"),
  })
  .strict();

export type SocialAccountCreateBody = z.infer<typeof socialAccountCreateSchema>;
