import * as vscode from "vscode";

import {
  type AiRequestConfig,
  MissingApiKeyError,
  resolveAiRequestConfig,
} from "./resolveAiRequestConfig";

/**
 * Resolves the configuration required for an AI request.
 *
 * When the selected provider has no stored API key, this function
 * shows an actionable error message and returns undefined.
 */
export async function getAiRequestConfigOrShowError(
  context: vscode.ExtensionContext,
  resource?: vscode.Uri,
): Promise<AiRequestConfig | undefined> {
  try {
    return await resolveAiRequestConfig(context, resource);
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      const selectedAction = await vscode.window.showErrorMessage(error.message, "Manage API Keys");

      if (selectedAction === "Manage API Keys") {
        await vscode.commands.executeCommand("czaza.manageApiKeys");
      }

      return undefined;
    }

    const message = error instanceof Error ? error.message : "Unknown error.";

    void vscode.window.showErrorMessage(`Failed to load the CZaza AI configuration: ${message}`);

    return undefined;
  }
}
