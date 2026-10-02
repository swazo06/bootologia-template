export type {
  TemplateConfig,
  GeneratedContent,
  QualityReport,
  ContentBrief,
  BrandInput,
} from "@/lib/validation/schemas";

export type {
  ContentStatus,
} from "@/lib/validation/status-transitions";

export const ALLOWED_DYNAMIC_FIELDS = [
  "label",
  "headline",
  "subtitle",
  "body",
  "cta",
  "mainImage",
  "caption",
  "hashtags",
  "altText",
] as const;

export type AllowedDynamicField = (typeof ALLOWED_DYNAMIC_FIELDS)[number];

export const PIPELINE_STEPS = [
  "BRIEF_VALIDATION",
  "CONTENT_GENERATION",
  "CONTENT_QA",
  "ASSET_VALIDATION",
  "TEXT_FIT",
  "TEMPLATE_RENDER",
  "IMAGE_EXPORT",
  "STORAGE_UPLOAD",
  "PREVIEW_READY",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];
