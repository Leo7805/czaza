import { SYSTEM_PROMPT } from "@shared/prompts/systemPrompt";

type DeepSeekChatResponse = {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
};

export async function callDeepSeek(prompt: string): Promise<string> {
  const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error("Missing VITE_DEEPSEEK_API_KEY");
  }

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
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
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText);
  }

  const data = (await response.json()) as DeepSeekChatResponse;

  return data.choices?.[0]?.message?.content ?? "";
}
