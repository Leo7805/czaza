/**
 * Reads non-sensitive CZaza settings from VS Code configuration.
 */

import * as vscode from "vscode";

import {
  AI_CATALOG,
  type AiModel,
  type AiProvider,
  type AiResponseLanguage,
  isSupportedModel,
  isSupportedProvider,
  isSupportedResponseLanguage,
} from "./aiCatalog";

/**
 * Default CZaza configuration values.
 */
const DEFAULT_AI_PROVIDER: AiProvider = "deepseek";
const DEFAULT_RESPONSE_LANGUAGE: AiResponseLanguage = "en";
const DEFAULT_OUTPUT_DIRECTORY = ".czaza";
const DEFAULT_ROOT_DIRECTORY = "";

/**
 * Validated, non-sensitive CZaza settings used by the extension.
 *
 * The API key is intentionally excluded because it will be stored
 * separately in VS Code SecretStorage.
 *
 * @example
 * const settings = getCzazaSettings(vscode.window.activeTextEditor?.document.uri);
 */
export type CzazaSettings = {
  ai: {
    provider: AiProvider;
    model: AiModel;
    responseLanguage: AiResponseLanguage;
  };
  rootDirectory: string;
  outputDirectory: string;
};

/**
 * Reads and validates CZaza settings from VS Code.
 *
 * @param resource Optional file or workspace folder used to resolve
 * resource-scoped settings such as the output directory.
 * @returns Validated non-sensitive CZaza settings.
 *
 * @example
 * const settings = getCzazaSettings(document.uri);
 */
export function getCzazaSettings(resource?: vscode.Uri): CzazaSettings {
  const config = vscode.workspace.getConfiguration("czaza", resource);

  // Read and validate the selected AI provider.
  const configuredProvider = config.get<string>("ai.provider", DEFAULT_AI_PROVIDER);

  const provider = isSupportedProvider(configuredProvider)
    ? configuredProvider
    : DEFAULT_AI_PROVIDER;

  // Read and validate a model belonging to the selected provider.
  const defaultModel = AI_CATALOG[provider].defaultModel;

  const configuredModel = config.get<string>("ai.model", defaultModel);

  const model = isSupportedModel(provider, configuredModel) ? configuredModel : defaultModel;

  // Read and validate the AI response language.
  const configuredResponseLanguage = config.get<string>(
    "ai.responseLanguage",
    DEFAULT_RESPONSE_LANGUAGE,
  );

  const responseLanguage = isSupportedResponseLanguage(configuredResponseLanguage)
    ? configuredResponseLanguage
    : DEFAULT_RESPONSE_LANGUAGE;

  // An empty output directory is not useful, so fall back to ".czaza".
  const configuredOutputDirectory = config
    .get<string>("outputDirectory", DEFAULT_OUTPUT_DIRECTORY)
    .trim();

  const outputDirectory = configuredOutputDirectory || DEFAULT_OUTPUT_DIRECTORY;

  // Empty root directory means the active VS Code workspace folder is used.
  const rootDirectory = config.get<string>("rootDirectory", DEFAULT_ROOT_DIRECTORY).trim();

  return {
    ai: {
      provider,
      model,
      responseLanguage,
    },
    rootDirectory,
    outputDirectory,
  };
}
