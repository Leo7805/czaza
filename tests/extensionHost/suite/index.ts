/**
 * Runs CZaza's real Extension Host activation and filesystem regressions.
 */

import assert from "node:assert/strict";

import * as vscode from "vscode";

import {
  prepareExternalFileLifecycleFixture,
  runExternalFileLifecycleRegression,
} from "./externalFileLifecycleScenario";

const REQUIRED_COMMANDS = [
  "czaza.showNotes",
  "czaza.showNotesNavigator",
  "czaza.addLineNote",
  "czaza.addSectionNote",
] as const;

/**
 * Runs the minimal real Extension Host activation regression.
 *
 * @returns Promise resolved after activation and real filesystem checks pass.
 */
export async function run(): Promise<void> {
  const extension = vscode.extensions.all.find(
    (candidate) => candidate.packageJSON.name === "czaza",
  );

  assert.ok(extension, "CZaza must be loaded as the development extension.");
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  assert.ok(workspaceRoot, "The isolated fixture workspace must be open.");
  const filesystemFixture =
    await prepareExternalFileLifecycleFixture(workspaceRoot);

  await extension.activate();
  assert.equal(extension.isActive, true, "CZaza must activate successfully.");

  const commands = await vscode.commands.getCommands(true);

  for (const command of REQUIRED_COMMANDS) {
    assert.ok(commands.includes(command), `${command} must be registered.`);
  }

  await runExternalFileLifecycleRegression(filesystemFixture);
  console.log("CZaza Extension Host regressions passed.");
}
