/**
 * Registers the command that displays the current CZaza settings.
 */

import * as vscode from "vscode";

import { getCzazaSettings } from "@vscode/config/czazaSettings";
import { resolveCzazaRootDirectory } from "@vscode/config/resolveCzazaRootDirectory";

/**
 * Registers the command that shows the effective CZaza configuration.
 *
 * @param context - Current VS Code extension context.
 *
 * @example
 * registerShowCurrentSettingsCommand(context);
 */
export function registerShowCurrentSettingsCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand("czaza.showCurrentSettings", () => {
    const resource = vscode.window.activeTextEditor?.document.uri;
    const settings = getCzazaSettings(resource);
    const rootLabel = getRootLabel(resource);

    void vscode.window.showInformationMessage(
      [
        `Provider: ${settings.ai.provider}`,
        `Model: ${settings.ai.model}`,
        `Language: ${settings.ai.responseLanguage}`,
        `Root: ${rootLabel}`,
        `Output: ${settings.outputDirectory}`,
      ].join(" | "),
    );
  });

  context.subscriptions.push(command);
}

function getRootLabel(resource: vscode.Uri | undefined): string {
  try {
    const resolvedRoot = resolveCzazaRootDirectory(resource);

    return resolvedRoot.isConfigured
      ? `${resolvedRoot.rootDirectory} (configured: ${resolvedRoot.configuredRootDirectory})`
      : `${resolvedRoot.rootDirectory} (workspace default)`;
  } catch (error) {
    return error instanceof Error ? `Unavailable: ${error.message}` : "Unavailable";
  }
}
