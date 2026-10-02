import type { GeneratedContent, ContentBrief, TemplateConfig } from "@/types";
import { generatedContentSchema } from "@/lib/validation/schemas";
import type { AiProvider } from "@/providers/ai/types";
import { MockAiProvider } from "@/providers/ai/mock-ai-provider";

export const CONTENT_SYSTEM_PROMPT =
  "Tu es un rédacteur spécialisé dans les publications Facebook et Instagram. Tu ne dois pas créer, modifier ou proposer une mise en page graphique. La mise en page est définie dans un canevas verrouillé. Ta mission consiste uniquement à produire les valeurs textuelles et descriptives nécessaires pour remplir les placeholders autorisés. Tu dois respecter exactement les limites du template. Tu ne dois inventer aucune donnée, aucun prix, aucun chiffre, aucun témoignage, aucun client, aucune statistique ni aucun résultat. Retourne uniquement un objet JSON valide correspondant au schéma demandé.";

export const CONTENT_HARD_RULES = [
  "Ne propose aucune nouvelle mise en page, ni déplacement d'éléments.",
  "Ne demande aucune couleur, police, marge ou logo.",
  "Le prompt d'image ne doit demander aucun texte dans l'image.",
  "Le prompt d'image ne doit pas demander de recréer un logo.",
  "N'invente aucun prix, chiffre, statistique, client ou témoignage.",
  "Le label, titre, sous-titre et CTA doivent respecter maxCharacters, maxWords et maxLines.",
  "La légende doit rester inférieure ou égale à 900 caractères.",
  "Le nombre de hashtags doit être compris entre 5 et 8.",
  "Aucune instruction graphique ne doit apparaître dans les textes.",
] as const;

/** Phrases that would mean the assembled prompt is asking for free layout (forbidden). */
const FORBIDDEN_LAYOUT_REQUEST_PATTERNS = [
  /crée\s+(une\s+)?nouvelle\s+mise\s+en\s+page/i,
  /change\s+la\s+police/i,
  /choisis\s+(une\s+)?couleur/i,
  /déplace\s+le\s+(logo|texte|élément)/i,
  /repositionne/i,
  /free\s+layout/i,
  /redesign\s+the\s+template/i,
] as const;

export interface BrandPromptContext {
  name: string;
  description: string;
  toneOfVoice: string;
  targetAudience: string;
  forbiddenWords: string[];
  requiredTerms: string[];
}

export type ContentGenerationErrorCode =
  | "CONTENT_JSON_INVALID"
  | "CONTENT_PROMPT_LAYOUT_LEAK"
  | "CONTENT_IMAGE_PROMPT_INVALID";

export class ContentGenerationError extends Error {
  readonly code: ContentGenerationErrorCode;
  readonly details?: unknown;

  constructor(
    code: ContentGenerationErrorCode,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ContentGenerationError";
    this.code = code;
    this.details = details;
  }
}

export function assertPromptHasNoLayoutInstructions(prompt: string): void {
  for (const pattern of FORBIDDEN_LAYOUT_REQUEST_PATTERNS) {
    if (pattern.test(prompt)) {
      throw new ContentGenerationError(
        "CONTENT_PROMPT_LAYOUT_LEAK",
        `Prompt contains forbidden layout instruction: ${pattern}`,
      );
    }
  }
}

export function buildUserPrompt(input: {
  brand: BrandPromptContext;
  brief: ContentBrief;
  template: TemplateConfig;
}): string {
  const constraints = Object.entries(input.template.fields)
    .map(([key, field]) => {
      if (field.type === "text") {
        return `${key}: max ${field.maxCharacters} chars, ${field.maxWords} words, ${field.maxLines} lines`;
      }
      return `${key}: image ${field.expectedRatio}`;
    })
    .join("; ");

  const prompt = [
    `Marque: ${input.brand.name}`,
    `Description: ${input.brand.description}`,
    `Public cible: ${input.brief.targetAudience || input.brand.targetAudience}`,
    `Ton: ${input.brand.toneOfVoice}`,
    `Sujet: ${input.brief.topic}`,
    `Objectif: ${input.brief.objective}`,
    `Langue: ${input.brief.language}`,
    `Informations obligatoires: ${input.brief.requiredInformation ?? ""}`,
    `Informations interdites: ${input.brief.forbiddenInformation ?? ""}`,
    `Mots interdits marque: ${input.brand.forbiddenWords.join(", ")}`,
    `Termes obligatoires marque: ${input.brand.requiredTerms.join(", ")}`,
    `Contraintes du canevas: ${constraints}`,
    `Règles dures: ${CONTENT_HARD_RULES.join(" | ")}`,
    "Génère uniquement le contenu structuré destiné aux placeholders.",
    "N'inclus aucune instruction de mise en page, de couleur, de police ou de positionnement.",
  ].join("\n");

  assertPromptHasNoLayoutInstructions(prompt);
  return prompt;
}

function assertImageDescriptionSafe(imageDescription: string): void {
  const lower = imageDescription.toLowerCase();
  if (
    /\b(texte|text|typograph|écrire|ecrire|logo|watermark)\b/i.test(lower) &&
    /(dans l['']image|in the image|sur l['']image|overlay)/i.test(lower)
  ) {
    throw new ContentGenerationError(
      "CONTENT_IMAGE_PROMPT_INVALID",
      "imageDescription must not request text or logo inside the image",
    );
  }
}

export class ContentGenerator {
  constructor(private readonly ai: AiProvider = new MockAiProvider()) {}

  async generate(input: {
    brand: BrandPromptContext;
    brief: ContentBrief;
    template: TemplateConfig;
  }): Promise<GeneratedContent> {
    const system = CONTENT_SYSTEM_PROMPT;
    const user = buildUserPrompt(input);
    assertPromptHasNoLayoutInstructions(system);
    assertPromptHasNoLayoutInstructions(user);

    const raw = await this.ai.generateStructuredJson({ system, user });
    const parsed = generatedContentSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ContentGenerationError(
        "CONTENT_JSON_INVALID",
        "AI response does not match generatedContentSchema",
        parsed.error.flatten(),
      );
    }

    assertImageDescriptionSafe(parsed.data.imageDescription);
    return parsed.data;
  }
}

/** Re-export for callers that still import Mock from this module path. */
export type { AiProvider } from "@/providers/ai/types";
export { MockAiProvider } from "@/providers/ai/mock-ai-provider";
