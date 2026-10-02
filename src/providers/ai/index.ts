import type { AiProvider } from "@/providers/ai/types";
import { MockAiProvider } from "@/providers/ai/mock-ai-provider";
import { OpenAiCompatibleProvider } from "@/providers/ai/openai-compatible-provider";

export type { AiProvider } from "@/providers/ai/types";
export { MockAiProvider, MOCK_GENERATED_CONTENT } from "@/providers/ai/mock-ai-provider";
export { OpenAiCompatibleProvider } from "@/providers/ai/openai-compatible-provider";

export function createAiProvider(): AiProvider {
  const provider = process.env.AI_PROVIDER ?? "mock";
  if (provider === "mock") {
    return new MockAiProvider();
  }
  return new OpenAiCompatibleProvider();
}
