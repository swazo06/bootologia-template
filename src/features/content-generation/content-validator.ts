import type { GeneratedContent, QualityReport, TemplateConfig } from "@/types";
import { qualityReportSchema } from "@/lib/validation/schemas";
import {
  assertTransition,
  type ContentStatus,
} from "@/lib/validation/status-transitions";

const CLAIM_PATTERNS = [
  /\d+\s?%/,
  /\b\d+\s?(clients?|élèves?|euros?|€|dh)\b/i,
  /\b(garanti|toujours|jamais|#1|meilleur)\b/i,
  /\b(témoignage|avis client|résultat prouvé)\b/i,
];

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countLines(text: string): number {
  return text.split(/\r?\n/).length;
}

function normalizeIdea(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9àâäéèêëïîôùûüç\s]/gi, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function tokenOverlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const shared = a.filter((token) => setB.has(token)).length;
  return shared / Math.min(a.length, b.length);
}

function containsWholeWord(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i").test(haystack);
}

export interface BrandValidationContext {
  forbiddenWords: string[];
  requiredTerms: string[];
}

export class ContentValidationError extends Error {
  readonly code = "CONTENT_QA_FAILED" as const;
  readonly report: QualityReport;

  constructor(report: QualityReport) {
    super("CONTENT_QA_FAILED");
    this.name = "ContentValidationError";
    this.report = report;
  }
}

export function isCriticalFailure(report: QualityReport): boolean {
  return (
    !report.passed ||
    report.brandViolations.length > 0 ||
    report.unsupportedClaims.length > 0 ||
    report.overflowRisks.some((risk) => risk.severity === "HIGH")
  );
}

export function assertReadyForReview(
  report: QualityReport,
  fromStatus: ContentStatus = "GENERATING",
): void {
  if (isCriticalFailure(report)) {
    throw new ContentValidationError(report);
  }
  assertTransition(fromStatus, "REVIEW");
}

export class ContentValidator {
  validate(input: {
    content: GeneratedContent;
    template: TemplateConfig;
    brand: BrandValidationContext;
  }): QualityReport {
    const spellingIssues: string[] = [];
    const unsupportedClaims: string[] = [];
    const brandViolations: string[] = [];
    const duplicatedIdeas: string[] = [];
    const overflowRisks: QualityReport["overflowRisks"] = [];
    const recommendations: string[] = [];

    for (const [fieldName, fieldConfig] of Object.entries(input.template.fields)) {
      if (fieldConfig.type !== "text") continue;
      const value = String(
        (input.content as Record<string, unknown>)[fieldName] ?? "",
      );

      if (fieldConfig.required && !value.trim()) {
        brandViolations.push(`Champ obligatoire vide: ${fieldName}`);
      }

      if (value.length > fieldConfig.maxCharacters) {
        overflowRisks.push({ field: fieldName, severity: "HIGH" });
        brandViolations.push(
          `${fieldName} trop long (${value.length}/${fieldConfig.maxCharacters})`,
        );
      }
      if (countWords(value) > fieldConfig.maxWords) {
        overflowRisks.push({ field: fieldName, severity: "MEDIUM" });
        recommendations.push(
          `${fieldName}: réduire le nombre de mots (max ${fieldConfig.maxWords})`,
        );
      }
      if (countLines(value) > fieldConfig.maxLines) {
        overflowRisks.push({ field: fieldName, severity: "MEDIUM" });
        recommendations.push(
          `${fieldName}: réduire le nombre de lignes (max ${fieldConfig.maxLines})`,
        );
      }
    }

    if (input.content.caption.length > 900) {
      brandViolations.push("Caption dépasse 900 caractères");
      overflowRisks.push({ field: "caption", severity: "HIGH" });
    }

    if (
      input.content.hashtags.length < 5 ||
      input.content.hashtags.length > 8
    ) {
      brandViolations.push("Le nombre de hashtags doit être entre 5 et 8");
    }

    const blob = [
      input.content.label,
      input.content.headline,
      input.content.subtitle,
      input.content.cta,
      input.content.caption,
    ]
      .join(" ")
      .toLowerCase();

    for (const word of input.brand.forbiddenWords) {
      if (word && containsWholeWord(blob, word.toLowerCase())) {
        brandViolations.push(`Mot interdit détecté: ${word}`);
      }
    }

    for (const term of input.brand.requiredTerms) {
      if (term && !blob.includes(term.toLowerCase())) {
        brandViolations.push(`Terme obligatoire manquant: ${term}`);
      }
    }

    for (const pattern of CLAIM_PATTERNS) {
      const match = blob.match(pattern);
      if (match) {
        unsupportedClaims.push(
          `Affirmation non vérifiable détectée: "${match[0]}"`,
        );
      }
    }

    const headlineTokens = normalizeIdea(input.content.headline);
    const subtitleTokens = normalizeIdea(input.content.subtitle);
    const captionTokens = normalizeIdea(input.content.caption);
    const pairs: Array<[string, string, string[], string[]]> = [
      ["headline", "subtitle", headlineTokens, subtitleTokens],
      ["headline", "caption", headlineTokens, captionTokens],
      ["subtitle", "caption", subtitleTokens, captionTokens],
    ];
    for (const [left, right, a, b] of pairs) {
      if (tokenOverlapRatio(a, b) >= 0.7) {
        duplicatedIdeas.push(`Idées trop similaires entre ${left} et ${right}`);
      }
    }

    if (
      /\b(texte|logo)\b/i.test(input.content.imageDescription) &&
      /(dans|sur|in the|overlay)/i.test(input.content.imageDescription)
    ) {
      recommendations.push(
        "Le prompt d'image ne doit demander ni texte ni logo dans l'image",
      );
    }

    const passed =
      brandViolations.length === 0 &&
      unsupportedClaims.length === 0 &&
      !overflowRisks.some((r) => r.severity === "HIGH");

    if (!passed) {
      recommendations.push("Corriger les erreurs critiques avant REVIEW");
    }

    return qualityReportSchema.parse({
      passed,
      spellingIssues,
      unsupportedClaims,
      brandViolations,
      duplicatedIdeas,
      overflowRisks,
      recommendations,
    });
  }
}

export const contentValidator = new ContentValidator();
