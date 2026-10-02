import {
  ContentGenerator,
  MockAiProvider,
} from "@/features/content-generation/content-generator";
import { contentValidator } from "@/features/content-generation/content-validator";
import {
  DesignGenerationPipeline,
  createInitialPipelineState,
  clearPipelineIdempotencyStore,
  type PipelineExecuteOptions,
  type PipelineState,
  type StepLogEvent,
} from "@/features/designs/design-generation-pipeline";
import {
  createPipelineContext,
  textValuesFromContext,
  type PipelineContext,
} from "@/features/designs/pipeline-context";
import { cropForTemplateField } from "@/features/designs/image-crop-service";
import { textFitService } from "@/features/designs/text-fit-service";
import { templateRenderer } from "@/features/designs/template-renderer";
import { imageExportService } from "@/features/designs/image-export-service";
import { storageProvider } from "@/providers/storage/storage-provider";
import { templateRegistry } from "@/features/templates/template-registry";
import {
  writeJobLog,
  InMemoryJobLogStore,
} from "@/server/services/job-log-service";
import {
  getMetricsRegistry,
  METRIC,
} from "@/lib/metrics/registry";
import type { ContentBrief, PipelineStep } from "@/types";
import type { JobLogStatus } from "@prisma/client";

export { clearPipelineIdempotencyStore };

export async function runDesignPipeline(input: {
  brandSlug: string;
  templateId: string;
  brief: ContentBrief;
  brand: {
    name: string;
    description: string;
    toneOfVoice: string;
    targetAudience: string;
    forbiddenWords: string[];
    requiredTerms: string[];
  };
  idempotencyKey: string;
  imageHref?: string;
  imageBuffer?: Buffer;
  imageMimeType?: string;
  correlationId?: string;
  existingState?: PipelineState;
  existingCtx?: PipelineContext;
  onlySlide?: number;
  force?: boolean;
  failOnceAt?: PipelineStep;
  jobLogStore?: InMemoryJobLogStore;
}) {
  const loaded = await templateRegistry.loadTemplate(
    input.brandSlug,
    input.templateId,
  );

  const ctx =
    input.existingCtx ??
    createPipelineContext({
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      brandSlug: input.brandSlug,
      templateId: input.templateId,
      brief: input.brief,
      brand: input.brand,
      template: loaded.config,
      svgFiles: loaded.svgFiles,
      imageHref: input.imageHref,
      imageBuffer: input.imageBuffer,
      imageMimeType: input.imageMimeType,
    });

  const generator = new ContentGenerator(new MockAiProvider());
  let failArmed = Boolean(input.failOnceAt);

  const logStep = async (event: StepLogEvent) => {
    input.jobLogStore?.write({
      provider: "design-pipeline",
      action: event.step,
      status: event.status,
      correlationId: event.correlationId,
      durationMs: event.durationMs,
      errorCode: event.error,
      requestSummary: {
        correlationId: event.correlationId,
        idempotencyKey: event.idempotencyKey,
        onlySlide: event.onlySlide,
      },
      responseSummary: {
        durationMs: event.durationMs,
        status: event.status,
      },
    });
    await writeJobLog({
      provider: "design-pipeline",
      action: event.step,
      status: event.status as JobLogStatus,
      correlationId: event.correlationId,
      durationMs: event.durationMs,
      errorCode: event.error,
      requestSummary: {
        correlationId: event.correlationId,
        idempotencyKey: event.idempotencyKey,
        onlySlide: event.onlySlide,
      },
      responseSummary: {
        durationMs: event.durationMs,
        status: event.status,
      },
    });
  };

  const pipeline = new DesignGenerationPipeline(async (step, context, opts) => {
    if (failArmed && input.failOnceAt === step) {
      failArmed = false;
      throw new Error(`INJECTED_FAILURE:${step}`);
    }

    switch (step) {
      case "BRIEF_VALIDATION":
        if (!context.brief.topic || !context.brief.objective) {
          throw new Error("BRIEF_INVALID");
        }
        break;

      case "CONTENT_GENERATION": {
        const genStarted = Date.now();
        context.content = await generator.generate({
          brand: context.brand,
          brief: context.brief,
          template: context.template,
        });
        getMetricsRegistry().timing(
          METRIC.GENERATION_DURATION,
          Date.now() - genStarted,
        );
        break;
      }

      case "CONTENT_QA": {
        if (!context.content) throw new Error("CONTENT_MISSING");
        const contentForQa = {
          ...context.content,
          body: context.content.subtitle,
        };
        const report = contentValidator.validate({
          content: contentForQa as typeof context.content,
          template: context.template,
          brand: context.brand,
        });
        context.qualityReport = report;
        if (!report.passed) throw new Error("CONTENT_QA_FAILED");
        break;
      }

      case "ASSET_VALIDATION": {
        const mainImage = context.template.fields.mainImage;
        if (mainImage?.type === "image") {
          if (!context.imageBuffer && !context.imageHref) {
            throw new Error("ASSET_MISSING");
          }
          if (context.imageBuffer) {
            const cropped = await cropForTemplateField(
              context.imageBuffer,
              context.imageMimeType ?? "image/png",
              mainImage,
              context.template.dimensions.width,
              context.template.dimensions.height,
            );
            if (!cropped.success) {
              throw new Error(cropped.error?.code ?? "IMAGE_CORRUPT");
            }
            context.croppedImage = cropped;
          }
        }
        break;
      }

      case "TEXT_FIT": {
        const values = textValuesFromContext(context);
        const fontFamily =
          context.template.fonts[0]?.family ??
          context.template.fonts[0]?.fallback ??
          "Inter";
        const textFits: NonNullable<PipelineContext["textFits"]> = {};
        for (const [fieldName, field] of Object.entries(
          context.template.fields,
        )) {
          if (field.type !== "text") continue;
          const value = values[fieldName] ?? "";
          const fit = textFitService.fit(value, {
            width: context.template.dimensions.width * 0.8,
            height: field.maxLines * field.fontSize.default * 1.2,
            fontSize: field.fontSize,
            maxLines: field.maxLines,
            fontFamily,
          });
          if (!fit.success) {
            throw new Error(`TEXT_OVERFLOW:${fieldName}`);
          }
          textFits[fieldName] = fit;
        }
        context.textFits = textFits;
        break;
      }

      case "TEMPLATE_RENDER": {
        const slides = targetSlides(context, opts);
        const croppedImages = context.croppedImage
          ? { mainImage: context.croppedImage }
          : undefined;
        for (const slide of slides) {
          const rendered = templateRenderer.renderSvg({
            sourceSvg: slide.sourceSvg,
            config: context.template,
            values: textValuesFromContext(context),
            textFits: context.textFits,
            croppedImages,
          });
          slide.svg = rendered.svg;
        }
        break;
      }

      case "IMAGE_EXPORT": {
        const slides = targetSlides(context, opts);
        for (const slide of slides) {
          if (!slide.svg) throw new Error(`SVG_NOT_RENDERED:${slide.index}`);
          slide.export = await imageExportService.exportSvg({
            svg: slide.svg,
            config: context.template,
          });
        }
        break;
      }

      case "STORAGE_UPLOAD": {
        const slides = targetSlides(context, opts);
        const storageStarted = Date.now();
        for (const slide of slides) {
          if (!slide.export) throw new Error(`EXPORT_MISSING:${slide.index}`);
          const ext = slide.export.format === "png" ? "png" : "jpg";
          const key =
            context.slides.length > 1
              ? `renders/${context.idempotencyKey}/slide-${slide.index}.${ext}`
              : `renders/${context.idempotencyKey}.${ext}`;
          const uploaded = await storageProvider.upload({
            key,
            buffer: slide.export.buffer,
            contentType: slide.export.mimeType,
          });
          slide.assetUrl = uploaded.url;
        }
        getMetricsRegistry().timing(
          METRIC.STORAGE_DURATION,
          Date.now() - storageStarted,
        );
        break;
      }

      case "PREVIEW_READY":
        if (context.slides.some((s) => !s.assetUrl)) {
          throw new Error("ASSET_URL_MISSING");
        }
        break;

      default:
        break;
    }
  }, logStep);

  const pipelineStarted = Date.now();
  const state = await pipeline.execute(
    input.existingState ?? createInitialPipelineState(input.idempotencyKey),
    ctx,
    {
      onlySlide: input.onlySlide,
      force: input.force,
    },
  );
  getMetricsRegistry().timing(
    METRIC.PIPELINE_DURATION,
    Date.now() - pipelineStarted,
  );

  return {
    state,
    ctx,
    content: ctx.content,
    artifacts: {
      svg: ctx.slides[0]?.svg,
      assetUrl: ctx.slides[0]?.assetUrl,
      croppedImage: ctx.croppedImage,
      textFits: ctx.textFits,
      export: ctx.slides[0]?.export,
      slides: ctx.slides,
      versions: ctx.versions,
      version: ctx.version,
    },
  };
}

function targetSlides(
  ctx: PipelineContext,
  opts: PipelineExecuteOptions,
): PipelineContext["slides"] {
  if (opts.onlySlide != null) {
    const slide = ctx.slides.find((s) => s.index === opts.onlySlide);
    if (!slide) throw new Error(`SLIDE_NOT_FOUND:${opts.onlySlide}`);
    return [slide];
  }
  return ctx.slides;
}
