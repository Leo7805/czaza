import type * as vscode from "vscode";

import {
  AI_CATALOG,
  AI_RESPONSE_LANGUAGES,
  type AiModel,
  type AiProvider,
  type AiResponseLanguage,
} from "../config/aiCatalog";
import { getApiKey } from "../config/apiKeyStore";
import { getCzazaSettings } from "../config/czazaSettings";

/**
 * Complete AI configuration resolved for one outgoing request.
 *
 * This object may contain a plaintext API key and must not be logged,
 * persisted, cached, or sent to a Webview.
 */
export type AiRequestConfig = {
  provider: AiProvider;
  providerLabel: string;
  model: AiModel;
  responseLanguage: AiResponseLanguage;
  languageInstruction: string;
  apiKey: string;
};

/**
 * Error thrown when the selected AI provider has no stored API key.
 */
export class MissingApiKeyError extends Error {
  /**
   * Provider whose API key is missing.
   */
  readonly provider: AiProvider;

  constructor(provider: AiProvider, providerLabel: string) {
    super(
      `No API key is configured for ${providerLabel}. ` + `Run "CZaza: Manage API Keys" first.`,
    );

    this.name = "MissingApiKeyError";
    this.provider = provider;
  }
}

/**
 * Resolves the complete configuration required for an AI request.
 *
 * @param context Current VS Code extension context.
 * @param resource Optional resource used to resolve scoped settings.
 * @throws MissingApiKeyError when the selected provider has no API key.
 */
export async function resolveAiRequestConfig(
  context: vscode.ExtensionContext,
  resource?: vscode.Uri,
): Promise<AiRequestConfig> {
  const settings = getCzazaSettings(resource);

  const { provider, model, responseLanguage } = settings.ai;

  const providerDefinition = AI_CATALOG[provider];

  const storedApiKey = await getApiKey(context, provider);

  const apiKey = storedApiKey?.trim();

  if (!apiKey) {
    throw new MissingApiKeyError(provider, providerDefinition.label);
  }

  const languageDefinition = AI_RESPONSE_LANGUAGES[responseLanguage];

  return {
    provider,
    providerLabel: providerDefinition.label,
    model,
    responseLanguage,
    languageInstruction: languageDefinition.promptInstruction,
    apiKey,
  };
}
