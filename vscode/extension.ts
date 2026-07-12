/**
 * Main entry point for the CZaza VS Code extension.
 */

import * as vscode from "vscode";
import { ExplanationCache } from "./explanations/ExplanationCache";
import { ExplanationStore } from "./explanations/ExplanationStore";
import { registerExplanationCommands } from "./explanations/registerExplanationCommands";
import { CzazaViewProvider } from "./webview/CzazaViewProvider";
import { registerCopyForAICommands } from "./copyForAI/registerCopyForAICommands";
import { getCzazaSettings } from "./config/czazaSettings";
import { registerApiKeyManagementCommand } from "./commands/apiKeyManagementCommand";

/**
 * Activates the CZaza VS Code extension.
 */
export function activate(context: vscode.ExtensionContext) {
  // ---------------------------------------------------------------------------
  // Create shared services
  // ---------------------------------------------------------------------------

  /** Stores AI explanations for the current workspace. */
  const explanations = new ExplanationStore();

  /** In-memory cache to avoid repeated AI requests. */
  const explanationCache = new ExplanationCache();

  /** Webview provider for the CZaza side panel. */
  const provider = new CzazaViewProvider(
    context.extensionUri,
    context.workspaceState,
    explanations,
    explanationCache,
  );

  // ---------------------------------------------------------------------------
  // Register commands
  // ---------------------------------------------------------------------------

  /** Register "Copy for AI" related commands. */
  registerCopyForAICommands(context);

  /** Register AI explanation commands (Explain File, etc.). */
  registerExplanationCommands(context, explanations, explanationCache, async (uri) => {
    await provider.showResourceDescription(uri);
  });

  /** Register API key management command */
  registerApiKeyManagementCommand(context);

  /** Show the current CZaza configuration. */
  const showCurrentSettingsCommand = vscode.commands.registerCommand(
    "czaza.showCurrentSettings",
    () => {
      const settings = getCzazaSettings();

      void vscode.window.showInformationMessage(
        [
          `Provider: ${settings.ai.provider}`,
          `Model: ${settings.ai.model}`,
          `Language: ${settings.ai.responseLanguage}`,
          `Output: ${settings.outputDirectory}`,
        ].join(" | "),
      );
    },
  );

  // ---------------------------------------------------------------------------
  // Register UI components
  // ---------------------------------------------------------------------------

  context.subscriptions.push(
    /**
     * Register the CZaza description side panel.
     */
    vscode.window.registerWebviewViewProvider("czaza.descriptionView", provider),

    /**
     * Focus the description panel and display the selected resource.
     */
    vscode.commands.registerCommand("czaza.showDescription", async (uri?: vscode.Uri) => {
      try {
        // Best effort: focus the panel if it already exists.
        await vscode.commands.executeCommand("czaza.descriptionView.focus");
      } catch {
        // Ignore if the panel has not been created yet.
      }

      await provider.showResourceDescription(uri);
    }),

    /** Register the "Show Current Settings" command. */
    showCurrentSettingsCommand,
  );
}

/**
 * Deactivates the CZaza VS Code extension.
 */
export function deactivate() {}
