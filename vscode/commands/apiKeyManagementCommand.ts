import * as vscode from "vscode";

import { AI_CATALOG, type AiProvider } from "@vscode/config/aiCatalog";
import { deleteApiKey, hasApiKey, storeApiKey } from "@vscode/config/apiKeyStore";

/**
 * A provider item displayed in the API key management list.
 */
type ProviderQuickPickItem = vscode.QuickPickItem & {
  provider: AiProvider;
  configured: boolean;
};

/**
 * Actions supported for a provider API key.
 */
type ApiKeyAction = "set" | "replace" | "clear";

/**
 * An API key action displayed in the action list.
 */
type ApiKeyActionQuickPickItem = vscode.QuickPickItem & {
  action: ApiKeyAction;
};

/**
 * Creates the provider list and reads each provider's API key status.
 */
async function createProviderItems(
  context: vscode.ExtensionContext,
): Promise<ProviderQuickPickItem[]> {
  return Promise.all(
    Object.entries(AI_CATALOG).map(async ([providerId, providerDefinition]) => {
      const provider = providerId as AiProvider;

      const configured = await hasApiKey(context, provider);

      return {
        label: providerDefinition.label,
        description: configured ? "Configured" : "Not configured",
        detail: configured
          ? "Select to replace or clear the saved API key."
          : "Select to configure an API key.",
        provider,
        configured,
      };
    }),
  );
}

/**
 * Creates the actions available for a selected provider.
 */
function createActionItems(providerItem: ProviderQuickPickItem): ApiKeyActionQuickPickItem[] {
  if (!providerItem.configured) {
    return [
      {
        label: "Set API Key",
        description: `Configure ${providerItem.label}`,
        action: "set",
      },
    ];
  }

  return [
    {
      label: "Replace API Key",
      description: `Replace the saved key for ${providerItem.label}`,
      action: "replace",
    },
    {
      label: "Clear API Key",
      description: `Delete the saved key for ${providerItem.label}`,
      action: "clear",
    },
  ];
}

/**
 * Returns a readable message from an unknown caught error.
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}

/**
 * Registers the unified CZaza API key management command.
 */
export function registerApiKeyManagementCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand("czaza.manageApiKeys", async () => {
    const providerItems = await createProviderItems(context);

    const selectedProvider = await vscode.window.showQuickPick(providerItems, {
      title: "Manage CZaza API Keys",
      placeHolder: "Select an AI provider to manage its API key",
      ignoreFocusOut: true,
    });

    // The user closed the provider list.
    if (!selectedProvider) {
      return;
    }

    const selectedAction = await vscode.window.showQuickPick(createActionItems(selectedProvider), {
      title: `${selectedProvider.label} API Key`,
      placeHolder: "Select an action",
      ignoreFocusOut: true,
    });

    // The user closed the action list.
    if (!selectedAction) {
      return;
    }

    try {
      if (selectedAction.action === "clear") {
        const confirmation = await vscode.window.showWarningMessage(
          `Clear the CZaza API key for ${selectedProvider.label}?`,
          {
            modal: true,
            detail: "You will need to enter the API key again before using this provider.",
          },
          "Clear",
        );

        if (confirmation !== "Clear") {
          return;
        }

        await deleteApiKey(context, selectedProvider.provider);

        void vscode.window.showInformationMessage(
          `CZaza API key cleared for ${selectedProvider.label}.`,
        );

        return;
      }

      const apiKey = await vscode.window.showInputBox({
        title:
          selectedAction.action === "replace"
            ? `Replace ${selectedProvider.label} API Key`
            : `Set ${selectedProvider.label} API Key`,
        prompt: `Enter the API key for ${selectedProvider.label}.`,
        placeHolder: "Paste your API key",
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value.trim()) {
            return "API key cannot be empty.";
          }

          return undefined;
        },
      });

      // The user cancelled API key input.
      if (apiKey === undefined) {
        return;
      }

      await storeApiKey(context, selectedProvider.provider, apiKey);

      void vscode.window.showInformationMessage(
        `CZaza API key saved for ${selectedProvider.label}.`,
      );
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Failed to manage the CZaza API key: ${getErrorMessage(error)}`,
      );
    }
  });

  context.subscriptions.push(command);
}
