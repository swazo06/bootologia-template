import { z } from "zod";

export const platformSchema = z.enum(["FACEBOOK", "INSTAGRAM"]);
export const postTypeSchema = z.enum(["POSTER", "CAROUSEL"]);
export const contentFormatSchema = z.enum(["PORTRAIT", "SQUARE", "STORY"]);
export const templateStatusSchema = z.enum(["ACTIVE", "ARCHIVED", "INVALID"]);
export const contentStatusSchema = z.enum([
  "DRAFT",
  "GENERATING",
  "REVIEW",
  "APPROVED",
  "REJECTED",
  "SCHEDULED",
  "PROCESSING",
  "PUBLISHED",
  "FAILED",
  "CANCELLED",
]);

export const fontSizeRangeSchema = z
  .object({
    default: z.number().positive(),
    min: z.number().positive(),
    max: z.number().positive(),
  })
  .refine((v) => v.min <= v.default && v.default <= v.max, {
    message: "fontSize must satisfy min <= default <= max",
  });

export const textFieldConfigSchema = z.object({
  type: z.literal("text"),
  required: z.boolean(),
  placeholder: z.string().regex(/^\{\{[A-Z0-9_]+\}\}$/),
  maxCharacters: z.number().int().positive(),
  maxWords: z.number().int().positive(),
  maxLines: z.number().int().positive(),
  fontSize: fontSizeRangeSchema,
});

export const imageFieldConfigSchema = z.object({
  type: z.literal("image"),
  required: z.boolean(),
  placeholder: z.string().regex(/^\{\{[A-Z0-9_]+\}\}$/),
  expectedRatio: z.string(),
  minimumWidth: z.number().int().positive(),
  minimumHeight: z.number().int().positive(),
  fit: z.literal("cover"),
  allowUpscale: z.literal(false),
});

export const templateFieldSchema = z.union([
  textFieldConfigSchema,
  imageFieldConfigSchema,
]);

export const templateConfigSchema = z.object({
  id: z.string().min(1),
  brand: z.string().min(1),
  name: z.string().min(1),
  type: postTypeSchema,
  status: templateStatusSchema,
  version: z.number().int().positive(),
  format: contentFormatSchema,
  dimensions: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  source: z.object({
    svg: z.string().min(1),
    preview: z.string().min(1),
  }),
  fonts: z
    .array(
      z.object({
        family: z.string().min(1),
        required: z.boolean(),
        fallback: z.string().min(1),
      }),
    )
    .min(1),
  colors: z.object({
    background: z.string(),
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
  }),
  fields: z.record(z.string(), templateFieldSchema),
  export: z.object({
    format: z.enum(["png", "jpg", "jpeg"]),
    quality: z.number().int().min(1).max(100),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  slides: z
    .array(
      z.object({
        position: z.number().int().positive(),
        role: z.string(),
        svg: z.string(),
        fields: z.record(z.string(), templateFieldSchema).optional(),
      }),
    )
    .optional(),
});

export type TemplateConfig = z.infer<typeof templateConfigSchema>;

export const generatedContentSchema = z
  .object({
    label: z.string(),
    headline: z.string(),
    subtitle: z.string(),
    cta: z.string(),
    caption: z.string().max(900),
    hashtags: z.array(z.string()).min(5).max(8),
    imageDescription: z.string(),
    altText: z.string(),
  })
  .strict();

export type GeneratedContent = z.infer<typeof generatedContentSchema>;

export const qualityReportSchema = z
  .object({
    passed: z.boolean(),
    spellingIssues: z.array(z.string()),
    unsupportedClaims: z.array(z.string()),
    brandViolations: z.array(z.string()),
    duplicatedIdeas: z.array(z.string()),
    overflowRisks: z.array(
      z
        .object({
          slidePosition: z.number().int().nullable().optional(),
          field: z.string(),
          severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
        })
        .strict(),
    ),
    recommendations: z.array(z.string()),
  })
  .strict();

export type QualityReport = z.infer<typeof qualityReportSchema>;

export const contentBriefSchema = z.object({
  brandId: z.string().min(1),
  templateId: z.string().min(1),
  topic: z.string().min(1),
  objective: z.string().min(1),
  targetAudience: z.string().min(1),
  language: z.enum(["fr", "ar", "darija"]),
  offer: z.string().optional(),
  mainMessage: z.string().optional(),
  cta: z.string().optional(),
  requiredInformation: z.string().optional(),
  forbiddenInformation: z.string().optional(),
  additionalInstructions: z.string().optional(),
  imageSource: z.string().optional(),
});

export type ContentBrief = z.infer<typeof contentBriefSchema>;

export {
  brandInputSchema,
  brandUpdateSchema,
  brandListQuerySchema,
  brandIdSchema,
  type BrandInput,
  type BrandUpdateInput,
  type BrandListQuery,
  type BrandListResult,
} from "@/lib/validation/brand";
