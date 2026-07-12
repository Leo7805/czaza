import { SYSTEM_PROMPT } from "@shared/prompts/systemPrompt";
import type { AiClient } from "@shared/ai/aiClient";

/**
 * Default DeepSeek chat completions endpoint.
 */
const DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions";

/**
 * Default DeepSeek model used outside VS Code-configured runtime calls.
 */
const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";

/**
 * Default timeout for one DeepSeek HTTP request.
 */
const DEEPSEEK_TIMEOUT_MS = 75_000;

/**
 * Default sampling temperature for deterministic code explanations.
 */
const DEEPSEEK_TEMPERATURE = 0.2;

/**
 * Content type used by the DeepSeek chat completions API.
 */
const DEEPSEEK_CONTENT_TYPE = "application/json";

/**
 * Defensive error message used when no API key reaches the provider layer.
 */
const DEEPSEEK_MISSING_API_KEY_MESSAGE = "Missing DeepSeek API key.";

type DeepSeekChatResponse = {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
};

/**
 * Runtime options for one DeepSeek request.
 */
export type DeepSeekOptions = {
  /** DeepSeek API key used for the request. */
  apiKey?: string;

  /** DeepSeek model id to use for the request. */
  model?: string;

  /** Chat completions endpoint. */
  url?: string;

  /** Request timeout in milliseconds. */
  timeoutMs?: number;

  /** Sampling temperature sent to DeepSeek. */
  temperature?: number;

  /** System prompt sent before the user prompt. */
  systemPrompt?: string;
};

/**
 * Creates an AiClient backed by DeepSeek.
 *
 * @param options - DeepSeek request defaults captured by the client.
 * @returns AiClient implementation using DeepSeek chat completions.
 *
 * @example
 * const client = createDeepSeekClient({
 *   apiKey: "...",
 *   model: "deepseek-v4-flash",
 * });
 */
export function createDeepSeekClient(options: DeepSeekOptions): AiClient {
  return {
    complete: (prompt) => callDeepSeek(prompt, options),
  };
}

/**
 * Calls the DeepSeek chat completions API with one prompt.
 *
 * @param prompt - User prompt sent to DeepSeek.
 * @param options - Request options and provider defaults.
 * @returns Assistant message content returned by DeepSeek.
 *
 * @example
 * const text = await callDeepSeek("Return JSON.", {
 *   apiKey: "...",
 *   model: "deepseek-v4-flash",
 * });
 */
export async function callDeepSeek(prompt: string, options: DeepSeekOptions = {}): Promise<string> {
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY ?? process.env.VITE_DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error(DEEPSEEK_MISSING_API_KEY_MESSAGE);
  }

  const url = options.url ?? DEEPSEEK_CHAT_COMPLETIONS_URL;
  const model = options.model ?? DEEPSEEK_DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? DEEPSEEK_TIMEOUT_MS;
  const temperature = options.temperature ?? DEEPSEEK_TEMPERATURE;
  const systemPrompt = options.systemPrompt ?? SYSTEM_PROMPT;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  const response = await fetch(url, {
    method: "POST",
    signal: abortController.signal,
    headers: {
      "Content-Type": DEEPSEEK_CONTENT_TYPE,
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature,
    }),
  }).finally(() => {
    clearTimeout(timeoutId);
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(formatDeepSeekHttpError(response, errorText));
  }

  const data = (await response.json()) as DeepSeekChatResponse;

  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * Formats a DeepSeek HTTP failure with status information.
 *
 * @param response - Failed fetch response.
 * @param errorText - Response body returned by DeepSeek.
 * @returns Error message suitable for logs or user-facing fallback handling.
 *
 * @example
 * const message = formatDeepSeekHttpError(response, "invalid key");
 */
function formatDeepSeekHttpError(response: Response, errorText: string): string {
  const statusText = response.statusText ? ` ${response.statusText}` : "";
  const details = errorText.trim();

  return details
    ? `DeepSeek request failed (${response.status}${statusText}): ${details}`
    : `DeepSeek request failed (${response.status}${statusText}).`;
}

/**
 * Default DeepSeek client used by tests and non-VS Code entry points.
 */
export const deepSeekClient: AiClient = {
  complete: callDeepSeek,
};
