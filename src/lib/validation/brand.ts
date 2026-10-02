import { z } from "zod";

const hexColorSchema = z
  .string()
  .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "Couleur hex invalide");

export const brandInputSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Slug: a-z, 0-9 et tirets uniquement"),
  description: z.string().min(1).max(2000),
  defaultLanguage: z.string().min(1).max(16),
  availableLanguages: z.array(z.string().min(1)).min(1),
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema,
  accentColor: hexColorSchema,
  logoUrl: z.string().min(1).max(2000),
  toneOfVoice: z.string().min(1).max(1000),
  targetAudience: z.string().min(1).max(1000),
  preferredCTAs: z.array(z.string().min(1)).default([]),
  forbiddenWords: z.array(z.string().min(1)).default([]),
  requiredTerms: z.array(z.string().min(1)).default([]),
  defaultHashtags: z.array(z.string().min(1)).default([]),
  visualGuidelines: z.string().min(1).max(4000),
  isActive: z.boolean().default(true),
});

export type BrandInput = z.infer<typeof brandInputSchema>;

export const brandUpdateSchema = brandInputSchema.partial();
export type BrandUpdateInput = z.infer<typeof brandUpdateSchema>;

export const brandListQuerySchema = z.object({
  search: z.string().max(120).optional().default(""),
  status: z.enum(["all", "active", "inactive"]).optional().default("all"),
  language: z.string().max(16).optional().default(""),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type BrandListQuery = z.infer<typeof brandListQuerySchema>;

export type BrandListResult = {
  items: import("@prisma/client").Brand[];
  total: number;
  page: number;
  pageSize: number;
};

export const brandIdSchema = z.object({
  id: z.string().min(1),
});
