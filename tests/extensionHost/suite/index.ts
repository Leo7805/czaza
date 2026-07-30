/**
 * Verifies CZaza activation and command registration in a real Extension Host.
 */

import assert from "node:assert/strict";

import * as vscode from "vscode";

const REQUIRED_COMMANDS = [
  "czaza.showNotes",
  "czaza.showNotesNavigator",
  "czaza.addLineNote",
  "czaza.addSectionNote",
] as const;

/**
 * Runs the minimal real Extension Host activation regression.
 *
 * @returns Promise resolved after CZaza activates and exposes its core commands.
 */
export async function run(): Promise<void> {
  const extension = vscode.extensions.all.find(
    (candidate) => candidate.packageJSON.name === "czaza",
  );

  assert.ok(extension, "CZaza must be loaded as the development extension.");
  await extension.activate();
  assert.equal(extension.isActive, true, "CZaza must activate successfully.");

  const commands = await vscode.commands.getCommands(true);

  for (const command of REQUIRED_COMMANDS) {
    assert.ok(commands.includes(command), `${command} must be registered.`);
  }

  assert.equal(
    vscode.workspace.workspaceFolders?.length,
    1,
    "The isolated fixture workspace must be open.",
  );
  console.log("CZaza Extension Host activation regression passed.");
}
