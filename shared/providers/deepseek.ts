import { SYSTEM_PROMPT } from "@shared/prompts/systemPrompt";
import type { AiClient } from "@shared/ai/aiClient";

type DeepSeekChatResponse = {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
};

const DEFAULT_DEEPSEEK_TIMEOUT_MS = 75_000;

type DeepSeekOptions = {
  apiKey?: string;
};

export async function callDeepSeek(prompt: string, options: DeepSeekOptions = {}): Promise<string> {
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY ?? process.env.VITE_DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error("Missing DeepSeek API key. Set czaza.deepSeekApiKey or DEEPSEEK_API_KEY.");
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), DEFAULT_DEEPSEEK_TIMEOUT_MS);

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    signal: abortController.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
    }),
  }).finally(() => {
    clearTimeout(timeoutId);
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText);
  }

  const data = (await response.json()) as DeepSeekChatResponse;

  return data.choices?.[0]?.message?.content ?? "";
}

export const deepSeekClient: AiClient = {
  complete: callDeepSeek,
};
