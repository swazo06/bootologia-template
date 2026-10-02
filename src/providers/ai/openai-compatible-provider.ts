import type { AiProvider } from "@/providers/ai/types";

export class OpenAiCompatibleProvider implements AiProvider {
  async generateStructuredJson(input: {
    system: string;
    user: string;
  }): Promise<unknown> {
    const apiKey = process.env.AI_API_KEY;
    const baseUrl = process.env.AI_BASE_URL ?? "https://api.openai.com/v1";
    const model = process.env.AI_MODEL ?? "gpt-4o-mini";
    if (!apiKey) {
      throw new Error("AI_API_KEY missing");
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI provider error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");
    return JSON.parse(content) as unknown;
  }
}
