import type * as vscode from "vscode";

import type { AiProvider } from "./aiCatalog";

/**
 * Prefix used for all CZaza API key entries in VS Code SecretStorage.
 */
const API_KEY_SECRET_PREFIX = "czaza.ai";

/**
 * Creates the SecretStorage key used for a specific AI provider.
 */
function getApiKeySecretKey(provider: AiProvider): string {
  return `${API_KEY_SECRET_PREFIX}.${provider}.apiKey`;
}

/**
 * Stores an API key securely for a supported AI provider.
 */
export async function storeApiKey(
  context: vscode.ExtensionContext,
  provider: AiProvider,
  apiKey: string,
): Promise<void> {
  const normalizedApiKey = apiKey.trim();

  if (!normalizedApiKey) {
    throw new Error("API key cannot be empty.");
  }

  await context.secrets.store(
    getApiKeySecretKey(provider),
    normalizedApiKey,
  );
}

/**
 * Reads the stored API key for a supported AI provider.
 */
export async function getApiKey(
  context: vscode.ExtensionContext,
  provider: AiProvider,
): Promise<string | undefined> {
  return context.secrets.get(
    getApiKeySecretKey(provider),
  );
}

/**
 * Deletes the stored API key for a supported AI provider.
 */
export async function deleteApiKey(
  context: vscode.ExtensionContext,
  provider: AiProvider,
): Promise<void> {
  await context.secrets.delete(
    getApiKeySecretKey(provider),
  );
}

/**
 * Checks whether an API key has been stored for a provider.
 */
export async function hasApiKey(
  context: vscode.ExtensionContext,
  provider: AiProvider,
): Promise<boolean> {
  const apiKey = await getApiKey(context, provider);

  return apiKey !== undefined;
}