import { SYSTEM_PROMPT } from "@shared/prompts/systemPrompt";
import type { AiClient } from "@shared/ai/aiClient";
import { AI_REQUEST_DEFAULTS } from "@shared/config/aiRequestDefaults";

const DEEPSEEK_DEFAULTS = AI_REQUEST_DEFAULTS.deepSeek;

/**
 * Content type used by the DeepSeek chat completions API.
 */
const DEEPSEEK_CONTENT_TYPE = "application/json";

/**
 * Structured response mode used by every current CZaza AI request.
 */
const DEEPSEEK_RESPONSE_FORMAT = {
  type: "json_object",
} as const;

/**
 * Defensive error message used when no API key reaches the provider layer.
 */
const DEEPSEEK_MISSING_API_KEY_MESSAGE = "Missing DeepSeek API key.";

/**
 * Defensive error for the occasional empty response documented by DeepSeek JSON Mode.
 */
const DEEPSEEK_EMPTY_RESPONSE_MESSAGE = "DeepSeek returned an empty JSON response.";

type DeepSeekChatResponse = {
  choices?: {
    finish_reason?: string;
    message?: {
      content?: string | null;
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

  /** Maximum number of output tokens allowed for the request. */
  maxTokens?: number;

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

  const url = options.url ?? DEEPSEEK_DEFAULTS.url;
  const model = options.model ?? DEEPSEEK_DEFAULTS.defaultModel;
  const timeoutMs = options.timeoutMs ?? DEEPSEEK_DEFAULTS.timeoutMs;
  const temperature = options.temperature ?? DEEPSEEK_DEFAULTS.temperature;
  const maxTokens = normalizeMaxTokens(options.maxTokens);
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
      response_format: DEEPSEEK_RESPONSE_FORMAT,
      ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
    }),
  }).finally(() => {
    clearTimeout(timeoutId);
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(formatDeepSeekHttpError(response, errorText));
  }

  const data = (await response.json()) as DeepSeekChatResponse;
  const choice = data.choices?.[0];

  if (choice?.finish_reason === "length") {
    throw new Error(
      "DeepSeek response was truncated because it reached the output token limit.",
    );
  }

  const content = choice?.message?.content;

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error(DEEPSEEK_EMPTY_RESPONSE_MESSAGE);
  }

  return content;
}

/**
 * Validates an optional DeepSeek output token cap.
 *
 * @param value - Configured max_tokens request value.
 * @returns The validated value or undefined when no cap was provided.
 */
function normalizeMaxTokens(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError("DeepSeek maxTokens must be a positive integer.");
  }

  return value;
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
