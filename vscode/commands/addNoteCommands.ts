/**
 * Registers selection-aware commands for creating User Notes.
 */

import * as vscode from "vscode";

import { evaluateCzazaResourceAccess } from "@vscode/services/resourceAccess";
import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";
import { NOTES_VIEW_ID } from "@vscode/notesUi/registerNotesUi";

const CAN_ADD_LINE_NOTE_CONTEXT = "czaza.canAddLineNote";
const CAN_ADD_SECTION_NOTE_CONTEXT = "czaza.canAddSectionNote";
const ADD_LINE_NOTE_COMMAND = "czaza.addLineNote";
const ADD_SECTION_NOTE_COMMAND = "czaza.addSectionNote";

/** Dependencies required to register User Note commands. */
export type RegisterAddNoteCommandsInput = {
  /** Extension context used to own command and event subscriptions. */
  context: vscode.ExtensionContext;

  /** Notes provider that opens the User Note editor. */
  provider: NotesViewProvider;
};

/**
 * Registers Line/Section User Note commands and their selection context keys.
 *
 * @param input - Command registration dependencies.
 *
 * @example
 * registerAddNoteCommands({ context, provider });
 */
export function registerAddNoteCommands(input: RegisterAddNoteCommandsInput): void {
  const updateSelectionContext = (): void => {
    void updateNoteCommandContext();
  };

  input.context.subscriptions.push(
    vscode.commands.registerCommand(ADD_LINE_NOTE_COMMAND, () => {
      void addLineNote(input.provider);
    }),
    vscode.commands.registerCommand(ADD_SECTION_NOTE_COMMAND, () => {
      void addSectionNote(input.provider);
    }),
    vscode.window.onDidChangeActiveTextEditor(updateSelectionContext),
    vscode.window.onDidChangeTextEditorSelection(updateSelectionContext),
  );

  updateSelectionContext();
}

async function addLineNote(provider: NotesViewProvider): Promise<void> {
  const editor = getEligibleEditor();

  if (!editor || !(await canAddLineNote(editor))) {
    return;
  }

  await vscode.commands.executeCommand(`${NOTES_VIEW_ID}.focus`);
  await provider.openUserNoteEditor(editor.document.uri, {
    level: "line",
    line: editor.selection.active.line + 1,
  });
}

async function addSectionNote(provider: NotesViewProvider): Promise<void> {
  const editor = getEligibleEditor();

  if (
    !editor ||
    !isMultiLineSelection(editor) ||
    !(await canUseCzazaResource(editor.document.uri))
  ) {
    return;
  }

  const startLine = editor.selection.start.line + 1;
  const endLine = editor.selection.end.line + 1;

  try {
    const location = await provider.resolveCurrentNoteStoreLocation(editor.document.uri);
    await vscode.commands.executeCommand(`${NOTES_VIEW_ID}.focus`);
    await provider.openUserSectionNoteEditor({
      document: editor.document,
      startLine,
      endLine,
      ...(location ? { location } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    void vscode.window.showErrorMessage(`Failed to add CZaza Section Note: ${message}`);
  }
}

function getEligibleEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  return editor?.document.uri.scheme === "file" ? editor : undefined;
}

async function updateNoteCommandContext(): Promise<void> {
  const editor = getEligibleEditor();
  const canUseResource = editor ? await canUseCzazaResource(editor.document.uri) : false;
  const canAddSection = canUseResource && Boolean(editor && isMultiLineSelection(editor));
  const canAddLine = canUseResource && Boolean(!editor || (editor && !canAddSection));

  await vscode.commands.executeCommand("setContext", CAN_ADD_LINE_NOTE_CONTEXT, canAddLine);
  await vscode.commands.executeCommand("setContext", CAN_ADD_SECTION_NOTE_CONTEXT, canAddSection);
}

async function canAddLineNote(editor: vscode.TextEditor): Promise<boolean> {
  return (await canUseCzazaResource(editor.document.uri)) && !isMultiLineSelection(editor);
}

/**
 * Checks whether a command target passes the shared CZaza resource Gate.
 *
 * @param uri - Active editor resource considered by an Add Note command.
 * @returns Promise resolving to true when the resource is allowed.
 */
async function canUseCzazaResource(uri: vscode.Uri): Promise<boolean> {
  try {
    return evaluateCzazaResourceAccess(uri).allowed;
  } catch {
    return false;
  }
}

function isMultiLineSelection(editor: vscode.TextEditor): boolean {
  return !editor.selection.isEmpty && editor.selection.start.line !== editor.selection.end.line;
}
