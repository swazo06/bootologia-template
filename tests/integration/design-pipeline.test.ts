import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPipelineIdempotencyStore,
  runDesignPipeline,
} from "@/server/services/design-pipeline-service";
import { InMemoryJobLogStore } from "@/server/services/job-log-service";
import { PIPELINE_STEPS } from "@/types";

const brand = {
  name: "BotoSchool",
  description: "École pratique",
  toneOfVoice: "clair",
  targetAudience: "adultes",
  forbiddenWords: [] as string[],
  requiredTerms: [] as string[],
};

describe("design-pipeline integration", () => {
  beforeEach(() => {
    clearPipelineIdempotencyStore();
  });

  it(
    "runs a full poster pipeline to PREVIEW_READY",
    async () => {
      const jobLogStore = new InMemoryJobLogStore();
      const result = await runDesignPipeline({
        brandSlug: "botoschool",
        templateId: "poster-service-v1",
        brand,
        brief: {
          brandId: "botoschool",
          templateId: "poster-service-v1",
          topic: "Formation web",
          objective: "Inscription",
          targetAudience: "adultes",
          language: "fr",
        },
        idempotencyKey: "poster-full-1",
        imageHref: "https://example.com/poster.jpg",
        jobLogStore,
      });

      expect(result.state.steps.every((s) => s.status === "SUCCESS")).toBe(true);
      expect(result.state.steps.at(-1)?.step).toBe("PREVIEW_READY");
      expect(result.artifacts.slides).toHaveLength(1);
      expect(result.artifacts.slides?.[0]?.assetUrl).toMatch(/^https:\/\//);
      expect(result.artifacts.version).toBe(1);
      expect(result.artifacts.versions).toHaveLength(1);

      for (const step of PIPELINE_STEPS) {
        expect(
          jobLogStore.entries.some(
            (e) => e.action === step && e.status === "RUNNING",
          ),
        ).toBe(true);
        expect(
          jobLogStore.entries.some(
            (e) => e.action === step && e.status === "SUCCESS",
          ),
        ).toBe(true);
      }
    },
    30_000,
  );

  it(
    "generates a six-slide carousel",
    async () => {
      const result = await runDesignPipeline({
        brandSlug: "botoschool",
        templateId: "carousel-educational-v1",
        brand,
        brief: {
          brandId: "botoschool",
          templateId: "carousel-educational-v1",
          topic: "Apprendre",
          objective: "Éduquer",
          targetAudience: "adultes",
          language: "fr",
        },
        idempotencyKey: "carousel-full-1",
      });

      expect(result.state.steps.every((s) => s.status === "SUCCESS")).toBe(true);
      expect(result.artifacts.slides).toHaveLength(6);
      expect(
        result.artifacts.slides?.every((s) => Boolean(s.assetUrl && s.export)),
      ).toBe(true);
    },
    60_000,
  );

  it(
    "resumes after failure without repeating successful steps",
    async () => {
      const first = await runDesignPipeline({
        brandSlug: "botoschool",
        templateId: "carousel-educational-v1",
        brand,
        brief: {
          brandId: "botoschool",
          templateId: "carousel-educational-v1",
          topic: "Apprendre",
          objective: "Éduquer",
          targetAudience: "adultes",
          language: "fr",
        },
        idempotencyKey: "carousel-resume-1",
        failOnceAt: "CONTENT_QA",
      });

      expect(
        first.state.steps.find((s) => s.step === "CONTENT_QA")?.status,
      ).toBe("FAILED");
      expect(
        first.state.steps.find((s) => s.step === "CONTENT_GENERATION")?.status,
      ).toBe("SUCCESS");

      const resumed = await runDesignPipeline({
        brandSlug: "botoschool",
        templateId: "carousel-educational-v1",
        brand,
        brief: first.ctx.brief,
        idempotencyKey: "carousel-resume-1",
        existingState: first.state,
        existingCtx: first.ctx,
      });

      expect(resumed.state.steps.every((s) => s.status === "SUCCESS")).toBe(
        true,
      );
      expect(resumed.artifacts.slides).toHaveLength(6);
    },
    60_000,
  );

  it(
    "regenerates a single slide without changing others",
    async () => {
      const full = await runDesignPipeline({
        brandSlug: "botoschool",
        templateId: "carousel-educational-v1",
        brand,
        brief: {
          brandId: "botoschool",
          templateId: "carousel-educational-v1",
          topic: "Apprendre",
          objective: "Éduquer",
          targetAudience: "adultes",
          language: "fr",
        },
        idempotencyKey: "carousel-slide-1",
      });

      const before = full.artifacts.slides!.map((s) => s.assetUrl);
      const beforeChecksum = full.artifacts.slides![2]!.export!.checksum;
      const versionBefore = full.ctx.version;

      const regen = await runDesignPipeline({
        brandSlug: "botoschool",
        templateId: "carousel-educational-v1",
        brand,
        brief: full.ctx.brief,
        idempotencyKey: "carousel-slide-1",
        existingState: full.state,
        existingCtx: full.ctx,
        onlySlide: 3,
      });

      const after = regen.artifacts.slides!.map((s) => s.assetUrl);
      expect(after[0]).toBe(before[0]);
      expect(after[1]).toBe(before[1]);
      expect(after[3]).toBe(before[3]);
      expect(after[4]).toBe(before[4]);
      expect(after[5]).toBe(before[5]);
      expect(after[2]).toBeTruthy();
      expect(regen.artifacts.slides![2]!.export!.checksum).toBe(beforeChecksum);
      expect(regen.ctx.version).toBeGreaterThan(versionBefore);
    },
    60_000,
  );

  it(
    "is idempotent for the same key",
    async () => {
      const jobLogStore = new InMemoryJobLogStore();
      const first = await runDesignPipeline({
        brandSlug: "botoschool",
        templateId: "poster-service-v1",
        brand,
        brief: {
          brandId: "botoschool",
          templateId: "poster-service-v1",
          topic: "Formation web",
          objective: "Inscription",
          targetAudience: "adultes",
          language: "fr",
        },
        idempotencyKey: "poster-idem-1",
        imageHref: "https://example.com/poster.jpg",
        jobLogStore,
      });
      const logsAfterFirst = jobLogStore.entries.length;

      const second = await runDesignPipeline({
        brandSlug: "botoschool",
        templateId: "poster-service-v1",
        brand,
        brief: first.ctx.brief,
        idempotencyKey: "poster-idem-1",
        imageHref: "https://example.com/poster.jpg",
        existingState: first.state,
        existingCtx: first.ctx,
        jobLogStore,
      });

      expect(second.state.steps.every((s) => s.status === "SUCCESS")).toBe(true);
      expect(jobLogStore.entries.length).toBe(logsAfterFirst);
      expect(second.ctx.version).toBe(first.ctx.version);
    },
    30_000,
  );

  it(
    "keeps version history on force regenerate",
    async () => {
      const first = await runDesignPipeline({
        brandSlug: "botoschool",
        templateId: "poster-service-v1",
        brand,
        brief: {
          brandId: "botoschool",
          templateId: "poster-service-v1",
          topic: "Formation web",
          objective: "Inscription",
          targetAudience: "adultes",
          language: "fr",
        },
        idempotencyKey: "poster-version-1",
        imageHref: "https://example.com/poster.jpg",
      });

      const versionBefore = first.ctx.version;
      const versionsBefore = first.ctx.versions.length;

      const second = await runDesignPipeline({
        brandSlug: "botoschool",
        templateId: "poster-service-v1",
        brand,
        brief: first.ctx.brief,
        idempotencyKey: "poster-version-1",
        imageHref: "https://example.com/poster.jpg",
        existingState: first.state,
        existingCtx: first.ctx,
        force: true,
      });

      expect(second.ctx.versions.length).toBeGreaterThan(versionsBefore);
      expect(second.ctx.version).toBeGreaterThan(versionBefore);
      expect(second.ctx.versions[0]?.version).toBe(1);
    },
    60_000,
  );
});
