"use server";

import { requireRole } from "@/lib/auth/supabase";
import {
  contentBriefSchema,
  generatedContentSchema,
  type GeneratedContent,
} from "@/lib/validation/schemas";
import { getBrandRepository } from "@/server/repositories/brand-repository";
import {
  attachContentDraftPipelineState,
  getContentDraftRepository,
} from "@/server/repositories/content-draft-repository";
import { createTemplateService } from "@/server/services/template-service";
import {
  ContentGenerationError,
  ContentGenerator,
} from "@/features/content-generation/content-generator";
import {
  assertReadyForReview,
  contentValidator,
  ContentValidationError,
} from "@/features/content-generation/content-validator";
import { createAiProvider } from "@/providers/ai";
import { z } from "zod";

export type GenerateContentActionResult =
  | {
      ok: true;
      data: unknown;
      qualityReport: unknown;
      draftId: string;
      version: number;
      status: string;
    }
  | { ok: false; error: string; details?: unknown };

export type ValidateContentActionResult =
  | { ok: true; data: unknown; qualityReport: unknown }
  | { ok: false; error: string; details?: unknown };

export async function generateContentAction(
  raw: unknown,
): Promise<GenerateContentActionResult> {
  try {
    await requireRole(["EDITOR", "ADMIN"]);
    const brief = contentBriefSchema.parse(raw);

    const brand = await getBrandRepository().findById(brief.brandId);
    if (!brand) {
      const bySlug = await getBrandRepository().findBySlug(brief.brandId);
      if (!bySlug) {
        return { ok: false, error: "BRAND_NOT_FOUND" };
      }
      return generateForBrand(bySlug, brief);
    }
    return generateForBrand(brand, brief);
  } catch (error) {
    if (error instanceof ContentGenerationError) {
      return {
        ok: false,
        error: error.code,
        details: error.details,
      };
    }
    if (error instanceof ContentValidationError) {
      return {
        ok: false,
        error: error.code,
        details: error.report,
      };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "UNKNOWN",
    };
  }
}

const validateContentInputSchema = z.object({
  brandId: z.string().min(1),
  templateId: z.string().min(1),
  content: generatedContentSchema,
});

export async function validateContentAction(
  raw: unknown,
): Promise<ValidateContentActionResult> {
  try {
    await requireRole(["EDITOR", "ADMIN"]);
    const input = validateContentInputSchema.parse(raw);

    let brand = await getBrandRepository().findById(input.brandId);
    if (!brand) {
      brand = await getBrandRepository().findBySlug(input.brandId);
    }
    if (!brand) {
      return { ok: false, error: "BRAND_NOT_FOUND" };
    }

    const usable = await createTemplateService().getUsable(
      brand.slug,
      input.templateId,
    );
    const report = contentValidator.validate({
      content: input.content,
      template: usable.loaded.config,
      brand: {
        forbiddenWords: brand.forbiddenWords,
        requiredTerms: brand.requiredTerms,
      },
    });

    assertReadyForReview(report);
    return { ok: true, data: input.content, qualityReport: report };
  } catch (error) {
    if (error instanceof ContentValidationError) {
      return {
        ok: false,
        error: error.code,
        details: error.report,
      };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "UNKNOWN",
    };
  }
}

async function generateForBrand(
  brand: {
    id: string;
    name: string;
    slug: string;
    description: string;
    toneOfVoice: string;
    targetAudience: string;
    forbiddenWords: string[];
    requiredTerms: string[];
    isActive: boolean;
  },
  brief: ReturnType<typeof contentBriefSchema.parse>,
): Promise<GenerateContentActionResult> {
  if (!brand.isActive) {
    return { ok: false, error: "BRAND_INACTIVE" };
  }

  const usable = await createTemplateService().getUsable(
    brand.slug,
    brief.templateId,
  );

  const generator = new ContentGenerator(createAiProvider());
  const data: GeneratedContent = await generator.generate({
    brand: {
      name: brand.name,
      description: brand.description,
      toneOfVoice: brand.toneOfVoice,
      targetAudience: brand.targetAudience,
      forbiddenWords: brand.forbiddenWords,
      requiredTerms: brand.requiredTerms,
    },
    brief: {
      ...brief,
      brandId: brand.id,
    },
    template: usable.loaded.config,
  });

  const qualityReport = contentValidator.validate({
    content: data,
    template: usable.loaded.config,
    brand: {
      forbiddenWords: brand.forbiddenWords,
      requiredTerms: brand.requiredTerms,
    },
  });

  if (!qualityReport.passed) {
    return {
      ok: false,
      error: "CONTENT_QA_FAILED",
      details: qualityReport,
    };
  }

  assertReadyForReview(qualityReport);

  const slideCount = usable.loaded.config.type === "CAROUSEL" ? 2 : 1;
  const previewUrls = Array.from(
    { length: slideCount },
    (_, i) => `https://cdn.example.com/renders/preview-${i + 1}.png`,
  );

  const draft = await getContentDraftRepository().create({
    brandId: brand.id,
    templateId: usable.record.id,
    type: usable.loaded.config.type,
    topic: brief.topic,
    objective: brief.objective,
    language: brief.language,
    status: "REVIEW",
    generatedContent: data,
    qualityReport: qualityReport as object,
    idempotencyKey: `gen:${brand.id}:${brief.templateId}:${Date.now()}`,
  });

  const withPreview = await attachContentDraftPipelineState(draft.id, {
    previewUrls,
    renderedAt: new Date().toISOString(),
  });

  return {
    ok: true,
    data,
    qualityReport,
    draftId: withPreview.id,
    version: withPreview.version,
    status: withPreview.status,
  };
}
