import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  assertReadyForReview,
  contentValidator,
  ContentValidationError,
  isCriticalFailure,
} from "@/features/content-generation/content-validator";
import {
  qualityReportSchema,
  templateConfigSchema,
} from "@/lib/validation/schemas";
import type { GeneratedContent } from "@/types";

const config = templateConfigSchema.parse(
  JSON.parse(
    readFileSync(
      path.join(
        process.cwd(),
        "templates/brands/botoschool/poster-service-v1/config.json",
      ),
      "utf8",
    ),
  ),
);

const baseContent: GeneratedContent = {
  label: "Formation",
  headline: "Apprenez plus vite",
  subtitle: "Des parcours concrets pour progresser chaque semaine.",
  cta: "Commencer",
  caption: "Une légende correcte pour le test unitaire de validation.",
  hashtags: ["#a", "#b", "#c", "#d", "#e"],
  imageDescription: "Photo lifestyle sans overlay.",
  altText: "Photo",
};

describe("content-validator", () => {
  it("detects forbidden words", () => {
    const report = contentValidator.validate({
      template: config,
      brand: { forbiddenWords: ["garanti"], requiredTerms: [] },
      content: {
        ...baseContent,
        headline: "Résultat garanti rapidement",
      },
    });
    expect(report.passed).toBe(false);
    expect(
      report.brandViolations.some((v) => v.includes("Mot interdit")),
    ).toBe(true);
  });

  it("detects missing required terms", () => {
    const report = contentValidator.validate({
      template: config,
      brand: { forbiddenWords: [], requiredTerms: ["formation"] },
      content: {
        ...baseContent,
        label: "Atelier",
        headline: "Apprenez plus vite",
        caption: "Une légende sans le terme attendu.",
      },
    });
    expect(report.passed).toBe(false);
    expect(
      report.brandViolations.some((v) => v.includes("Terme obligatoire")),
    ).toBe(true);
  });

  it("detects unverifiable claims", () => {
    const report = contentValidator.validate({
      template: config,
      brand: { forbiddenWords: [], requiredTerms: [] },
      content: {
        ...baseContent,
        subtitle: "Déjà 500 clients satisfaits chaque mois.",
      },
    });
    expect(report.passed).toBe(false);
    expect(report.unsupportedClaims.length).toBeGreaterThan(0);
    expect(isCriticalFailure(report)).toBe(true);
  });

  it("builds a schema-valid QualityReport for good content", () => {
    const report = contentValidator.validate({
      template: config,
      brand: { forbiddenWords: [], requiredTerms: [] },
      content: baseContent,
    });
    expect(report.passed).toBe(true);
    expect(qualityReportSchema.parse(report)).toEqual(report);
    expect(() => assertReadyForReview(report)).not.toThrow();
  });

  it("blocks REVIEW transition on critical failures", () => {
    const report = contentValidator.validate({
      template: config,
      brand: { forbiddenWords: [], requiredTerms: [] },
      content: {
        ...baseContent,
        headline: "x".repeat(100),
      },
    });
    expect(report.passed).toBe(false);
    expect(() => assertReadyForReview(report)).toThrow(ContentValidationError);
    try {
      assertReadyForReview(report);
    } catch (error) {
      expect(error).toBeInstanceOf(ContentValidationError);
      if (error instanceof ContentValidationError) {
        expect(error.code).toBe("CONTENT_QA_FAILED");
        expect(error.report.passed).toBe(false);
      }
    }
  });

  it("detects duplicated ideas across fields", () => {
    const report = contentValidator.validate({
      template: config,
      brand: { forbiddenWords: [], requiredTerms: [] },
      content: {
        ...baseContent,
        headline: "Apprenez plus vite chaque semaine",
        subtitle: "Apprenez plus vite chaque semaine vraiment",
        caption: "Apprenez plus vite chaque semaine avec nous",
      },
    });
    expect(report.duplicatedIdeas.length).toBeGreaterThan(0);
  });
});
