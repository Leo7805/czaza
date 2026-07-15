/**
 * Defines the AI providers, models, and response languages
 * officially supported by CZaza.
 *
 * Only options that have been integrated and tested by CZaza
 * should be added to this catalogue.
 */

import { AI_REQUEST_DEFAULTS } from "@shared/config/aiRequestDefaults";

const DEEPSEEK_V4_CAPABILITIES = AI_REQUEST_DEFAULTS.modelCapabilities.deepSeekV4;

export const AI_CATALOG = {
  deepseek: {
    label: "DeepSeek",
    models: [
      {
        id: "deepseek-v4-flash",
        label: "DeepSeek V4 Flash",
        contextWindowTokens: DEEPSEEK_V4_CAPABILITIES.contextWindowTokens,
        maxOutputTokens: DEEPSEEK_V4_CAPABILITIES.maxOutputTokens,
      },
      {
        id: "deepseek-v4-pro",
        label: "DeepSeek V4 Pro",
        contextWindowTokens: DEEPSEEK_V4_CAPABILITIES.contextWindowTokens,
        maxOutputTokens: DEEPSEEK_V4_CAPABILITIES.maxOutputTokens,
      },
    ],
    defaultModel: "deepseek-v4-flash",
  },
} as const;

/**
 * AI provider identifiers supported by CZaza.
 */
export type AiProvider = keyof typeof AI_CATALOG;

/**
 * AI model identifiers supported by CZaza.
 */
export type AiModel = (typeof AI_CATALOG)[AiProvider]["models"][number]["id"];

/**
 * Languages supported for AI-generated content.
 */
export const AI_RESPONSE_LANGUAGES = {
  en: {
    label: "English",
    promptInstruction: "Respond in English.",
  },
  "zh-CN": {
    label: "简体中文",
    promptInstruction: "Respond in Simplified Chinese.",
  },
} as const;

/**
 * AI response language identifiers supported by CZaza.
 */
export type AiResponseLanguage = keyof typeof AI_RESPONSE_LANGUAGES;

/**
 * Checks whether a value is a supported AI provider.
 */
export function isSupportedProvider(value: string): value is AiProvider {
  return value in AI_CATALOG;
}

/**
 * Checks whether a model is supported by a specific provider.
 */
export function isSupportedModel(provider: AiProvider, model: string): model is AiModel {
  return AI_CATALOG[provider].models.some((supportedModel) => supportedModel.id === model);
}

/**
 * Checks whether a value is a supported response language.
 */
export function isSupportedResponseLanguage(value: string): value is AiResponseLanguage {
  return value in AI_RESPONSE_LANGUAGES;
}
