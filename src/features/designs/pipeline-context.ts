import { randomUUID } from "node:crypto";
import type {
  ContentBrief,
  GeneratedContent,
  QualityReport,
  TemplateConfig,
} from "@/types";
import type { ImageCropResult } from "@/features/designs/image-crop-service";
import type { TextFitResult } from "@/features/designs/text-fit-service";
import type { ExportResult } from "@/features/designs/image-export-service";

export interface PipelineBrandFields {
  name: string;
  description: string;
  toneOfVoice: string;
  targetAudience: string;
  forbiddenWords: string[];
  requiredTerms: string[];
}

export interface PipelineSlideArtifact {
  index: number;
  sourceSvg: string;
  svg?: string;
  export?: ExportResult;
  assetUrl?: string;
}

export interface PipelineVersionRecord {
  version: number;
  completedAt: string;
  checksums: string[];
}

export interface PipelineContext {
  correlationId: string;
  idempotencyKey: string;
  brandSlug: string;
  templateId: string;
  brief: ContentBrief;
  brand: PipelineBrandFields;
  template: TemplateConfig;
  imageHref?: string;
  imageBuffer?: Buffer;
  imageMimeType?: string;
  content?: GeneratedContent;
  qualityReport?: QualityReport;
  croppedImage?: ImageCropResult;
  textFits?: Record<string, TextFitResult>;
  slides: PipelineSlideArtifact[];
  versions: PipelineVersionRecord[];
  version: number;
  /** When set by orchestrator for slide-scoped steps */
  onlySlide?: number;
}

export function buildSlidesFromTemplate(
  config: TemplateConfig,
  svgFiles: Record<string, string>,
): PipelineSlideArtifact[] {
  if (config.slides && config.slides.length > 0) {
    return config.slides.map((slide) => {
      const sourceSvg = svgFiles[slide.svg];
      if (!sourceSvg) {
        throw new Error(`SVG_MISSING:${slide.svg}`);
      }
      return {
        index: slide.position,
        sourceSvg,
      };
    });
  }

  const primary =
    svgFiles[config.source.svg] ?? Object.values(svgFiles)[0];
  if (!primary) {
    throw new Error("SVG_MISSING");
  }
  return [{ index: 1, sourceSvg: primary }];
}

export function createPipelineContext(input: {
  idempotencyKey: string;
  correlationId?: string;
  brandSlug: string;
  templateId: string;
  brief: ContentBrief;
  brand: PipelineBrandFields;
  template: TemplateConfig;
  svgFiles: Record<string, string>;
  imageHref?: string;
  imageBuffer?: Buffer;
  imageMimeType?: string;
}): PipelineContext {
  return {
    correlationId: input.correlationId ?? randomUUID(),
    idempotencyKey: input.idempotencyKey,
    brandSlug: input.brandSlug,
    templateId: input.templateId,
    brief: input.brief,
    brand: input.brand,
    template: input.template,
    imageHref: input.imageHref,
    imageBuffer: input.imageBuffer,
    imageMimeType: input.imageMimeType,
    slides: buildSlidesFromTemplate(input.template, input.svgFiles),
    versions: [],
    version: 0,
  };
}

export function textValuesFromContext(
  ctx: PipelineContext,
): Record<string, string> {
  const content = ctx.content;
  if (!content) return { mainImage: ctx.imageHref ?? "" };
  return {
    label: content.label,
    headline: content.headline,
    subtitle: content.subtitle,
    cta: content.cta,
    body: content.subtitle,
    mainImage: ctx.imageHref ?? "",
    caption: content.caption,
    altText: content.altText,
  };
}
