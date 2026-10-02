import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  assertPromptHasNoLayoutInstructions,
  buildUserPrompt,
  ContentGenerationError,
  ContentGenerator,
  CONTENT_HARD_RULES,
  CONTENT_SYSTEM_PROMPT,
} from "@/features/content-generation/content-generator";
import { MockAiProvider } from "@/providers/ai/mock-ai-provider";
import { createAiProvider } from "@/providers/ai";
import { templateConfigSchema } from "@/lib/validation/schemas";
import { generatedContentSchema } from "@/lib/validation/schemas";

const template = templateConfigSchema.parse(
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

const brand = {
  name: "BotoSchool",
  description: "École pratique",
  toneOfVoice: "clair",
  targetAudience: "adultes",
  forbiddenWords: ["garanti"],
  requiredTerms: ["formation"],
};

const brief = {
  brandId: "botoschool",
  templateId: "poster-service-v1",
  topic: "Formation web",
  objective: "Inscription",
  targetAudience: "adultes motivés",
  language: "fr" as const,
  requiredInformation: "Mentionner la méthode progressive",
  forbiddenInformation: "Aucun prix",
};

describe("content-generator", () => {
  it("generates valid JSON with MockAiProvider", async () => {
    const generator = new ContentGenerator(new MockAiProvider());
    const content = await generator.generate({ brand, brief, template });
    expect(generatedContentSchema.parse(content)).toEqual(content);
    expect(Object.keys(content).sort()).toEqual(
      [
        "altText",
        "caption",
        "cta",
        "hashtags",
        "headline",
        "imageDescription",
        "label",
        "subtitle",
      ].sort(),
    );
  });

  it("rejects invalid JSON / missing fields", async () => {
    const generator = new ContentGenerator(
      new MockAiProvider({ label: "x" }),
    );
    await expect(
      generator.generate({ brand, brief, template }),
    ).rejects.toMatchObject({ code: "CONTENT_JSON_INVALID" });
  });

  it("rejects additional properties", async () => {
    const generator = new ContentGenerator(
      new MockAiProvider({
        label: "Formation",
        headline: "Apprenez plus vite",
        subtitle: "Des parcours concrets pour progresser chaque semaine.",
        cta: "Commencer",
        caption: "Légende correcte sans inventer de chiffres.",
        hashtags: ["#a", "#b", "#c", "#d", "#e"],
        imageDescription: "Photo sans overlay.",
        altText: "Photo",
        layoutIdea: "Mettre le logo à gauche",
      }),
    );
    await expect(
      generator.generate({ brand, brief, template }),
    ).rejects.toBeInstanceOf(ContentGenerationError);
  });

  it("builds a user prompt with brand, language and constraints", () => {
    const prompt = buildUserPrompt({ brand, brief, template });
    expect(prompt).toContain("Marque: BotoSchool");
    expect(prompt).toContain("Langue: fr");
    expect(prompt).toContain("Informations obligatoires: Mentionner la méthode progressive");
    expect(prompt).toContain("Informations interdites: Aucun prix");
    expect(prompt).toContain("headline:");
    expect(prompt).toContain("max");
    for (const rule of CONTENT_HARD_RULES) {
      expect(prompt).toContain(rule.slice(0, 20));
    }
    expect(CONTENT_SYSTEM_PROMPT.toLowerCase()).toContain("mise en page");
    expect(CONTENT_SYSTEM_PROMPT.toLowerCase()).toContain("placeholders");
  });

  it("ensures prompts forbid free layout rather than request it", () => {
    const prompt = buildUserPrompt({ brand, brief, template });
    expect(() => assertPromptHasNoLayoutInstructions(prompt)).not.toThrow();
    expect(() =>
      assertPromptHasNoLayoutInstructions(
        "Crée une nouvelle mise en page avec le logo déplacé",
      ),
    ).toThrow(/CONTENT_PROMPT_LAYOUT_LEAK|forbidden layout/i);
    expect(prompt.toLowerCase()).toContain("aucune instruction de mise en page");
    expect(prompt).not.toMatch(/déplace le logo/i);
  });

  it("createAiProvider returns mock by default", () => {
    const previous = process.env.AI_PROVIDER;
    delete process.env.AI_PROVIDER;
    expect(createAiProvider()).toBeInstanceOf(MockAiProvider);
    if (previous !== undefined) process.env.AI_PROVIDER = previous;
  });
});
