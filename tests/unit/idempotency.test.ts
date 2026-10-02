import { beforeEach, describe, expect, it } from "vitest";
import {
  DesignGenerationPipeline,
  createInitialPipelineState,
  clearPipelineIdempotencyStore,
} from "@/features/designs/design-generation-pipeline";
import { createPipelineContext } from "@/features/designs/pipeline-context";
import type { PipelineStep } from "@/types";
import { templateConfigSchema } from "@/lib/validation/schemas";

const stubConfig = templateConfigSchema.parse({
  id: "stub",
  brand: "stub",
  name: "Stub",
  type: "POSTER",
  status: "ACTIVE",
  version: 1,
  format: "PORTRAIT",
  dimensions: { width: 1080, height: 1350 },
  source: { svg: "template.svg", preview: "preview.png" },
  fonts: [{ family: "Inter", required: true, fallback: "Arial" }],
  colors: {
    background: "#fff",
    primary: "#000",
    secondary: "#666",
    accent: "#0f0",
  },
  fields: {
    headline: {
      type: "text",
      required: true,
      placeholder: "{{HEADLINE}}",
      maxCharacters: 40,
      maxWords: 8,
      maxLines: 2,
      fontSize: { default: 32, min: 24, max: 32 },
    },
  },
  export: { format: "png", quality: 100, width: 1080, height: 1350 },
});

function stubCtx(key: string) {
  return createPipelineContext({
    idempotencyKey: key,
    brandSlug: "stub",
    templateId: "stub",
    brief: {
      brandId: "stub",
      templateId: "stub",
      topic: "t",
      objective: "o",
      targetAudience: "a",
      language: "fr",
    },
    brand: {
      name: "Stub",
      description: "d",
      toneOfVoice: "t",
      targetAudience: "a",
      forbiddenWords: [],
      requiredTerms: [],
    },
    template: stubConfig,
    svgFiles: {
      "template.svg":
        '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"></svg>',
    },
  });
}

describe("idempotency", () => {
  beforeEach(() => {
    clearPipelineIdempotencyStore();
  });

  it("does not re-run a completed pipeline for the same key", async () => {
    const calls: PipelineStep[] = [];
    const pipeline = new DesignGenerationPipeline(async (step) => {
      calls.push(step);
    });

    const state = createInitialPipelineState("key-1");
    const ctx = stubCtx("key-1");
    const first = await pipeline.execute(state, ctx);
    expect(first.steps.every((s) => s.status === "SUCCESS")).toBe(true);
    const firstCount = calls.length;

    const second = await pipeline.execute(first, ctx);
    expect(second.steps.every((s) => s.status === "SUCCESS")).toBe(true);
    expect(calls.length).toBe(firstCount);
  });

  it("can resume after failure without repeating successes", async () => {
    let failOnce = true;
    const calls: PipelineStep[] = [];
    const pipeline = new DesignGenerationPipeline(async (step) => {
      calls.push(step);
      if (step === "CONTENT_QA" && failOnce) {
        failOnce = false;
        throw new Error("boom");
      }
    });

    const state = createInitialPipelineState("key-resume");
    const ctx = stubCtx("key-resume");
    const failed = await pipeline.execute(state, ctx);
    expect(failed.steps.find((s) => s.step === "CONTENT_QA")?.status).toBe(
      "FAILED",
    );
    const afterFail = calls.length;

    const resumed = await pipeline.resume(failed, ctx);
    expect(resumed.steps.every((s) => s.status === "SUCCESS")).toBe(true);
    expect(calls[afterFail]).toBe("CONTENT_QA");
    expect(
      resumed.steps.find((s) => s.step === "BRIEF_VALIDATION")?.durationMs,
    ).toBeTypeOf("number");
  });
});
