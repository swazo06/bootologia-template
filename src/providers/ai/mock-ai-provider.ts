import type { AiProvider } from "@/providers/ai/types";

export const MOCK_GENERATED_CONTENT = {
  label: "Formation",
  headline: "Apprenez plus vite",
  subtitle: "Des parcours concrets pour progresser chaque semaine.",
  cta: "Commencer",
  caption:
    "Découvrez une méthode claire pour monter en compétence sans blabla.",
  hashtags: [
    "#formation",
    "#apprentissage",
    "#skills",
    "#bootcamp",
    "#carriere",
  ],
  imageDescription:
    "Photo lifestyle d'un étudiant concentré devant un ordinateur, sans texte ni logo.",
  altText: "Étudiant concentré devant un ordinateur portable",
} as const;

export class MockAiProvider implements AiProvider {
  constructor(private readonly payload: unknown = MOCK_GENERATED_CONTENT) {}

  async generateStructuredJson(): Promise<unknown> {
    return this.payload;
  }
}
