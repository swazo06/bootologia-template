import { describe, expect, it } from "vitest";
import { contentValidator } from "@/features/content-generation/content-validator";
import { templateConfigSchema } from "@/lib/validation/schemas";
import { readFileSync } from "node:fs";
import path from "node:path";

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

describe("content-length-validation", () => {
  it("rejects a headline that is too long", () => {
    const report = contentValidator.validate({
      template: config,
      brand: { forbiddenWords: [], requiredTerms: [] },
      content: {
        label: "Formation",
        headline: "x".repeat(100),
        subtitle: "Sous-titre valide pour le test unitaire.",
        cta: "Commencer",
        caption: "Une légende correcte.",
        hashtags: ["#a", "#b", "#c", "#d", "#e"],
        imageDescription: "Photo sans texte",
        altText: "Photo",
      },
    });
    expect(report.passed).toBe(false);
    expect(report.brandViolations.some((v) => v.includes("headline"))).toBe(
      true,
    );
  });

  it("rejects a CTA that is too long", () => {
    const report = contentValidator.validate({
      template: config,
      brand: { forbiddenWords: [], requiredTerms: [] },
      content: {
        label: "Formation",
        headline: "Apprenez plus vite",
        subtitle: "Sous-titre valide pour le test unitaire.",
        cta: "Ceci est un CTA beaucoup trop long",
        caption: "Une légende correcte.",
        hashtags: ["#a", "#b", "#c", "#d", "#e"],
        imageDescription: "Photo sans texte",
        altText: "Photo",
      },
    });
    expect(report.passed).toBe(false);
    expect(report.brandViolations.some((v) => v.includes("cta"))).toBe(true);
  });

  it("rejects an empty required field", () => {
    const report = contentValidator.validate({
      template: config,
      brand: { forbiddenWords: [], requiredTerms: [] },
      content: {
        label: "",
        headline: "Apprenez plus vite",
        subtitle: "Sous-titre valide pour le test unitaire.",
        cta: "Commencer",
        caption: "Une légende correcte.",
        hashtags: ["#a", "#b", "#c", "#d", "#e"],
        imageDescription: "Photo sans texte",
        altText: "Photo",
      },
    });
    expect(report.passed).toBe(false);
    expect(report.brandViolations.some((v) => v.includes("label"))).toBe(true);
  });
});
