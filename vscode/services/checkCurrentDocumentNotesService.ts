/**
 * Checks workspace notes for the current VS Code document.
 */

import type { Uri } from "vscode";

import { getCzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import type { SourceFileNoteCheckResult, WorkspaceNoteStore } from "@vscode/notes";

/**
 * Minimal VS Code document shape required for note detection.
 *
 * @example
 * const document: CheckCurrentDocumentNotesDocument = vscode.window.activeTextEditor.document;
 */
export type CheckCurrentDocumentNotesDocument = {
  /**
   * VS Code URI for the source document.
   */
  uri: Uri;

  /**
   * VS Code language id, such as `typescript`, `python`, or `plaintext`.
   */
  languageId: string;

  /**
   * Returns the full current document text.
   */
  getText(): string;
};

/**
 * Input used to check notes for the current document.
 *
 * @example
 * const result = await checkCurrentDocumentNotes({ document, notes });
 */
export type CheckCurrentDocumentNotesInput = {
  /**
   * Current VS Code document.
   */
  document: CheckCurrentDocumentNotesDocument;

  /**
   * Shared workspace note store created during extension activation.
   */
  notes: WorkspaceNoteStore;

  /**
   * Optional one-based first changed line. When provided, only notes affected
   * by that source change range are checked.
   */
  changedStartLine?: number;
};

/**
 * Checks current document notes against the current document text.
 *
 * This service does not update stored statuses, create notes, show UI, or run
 * AI. It only resolves VS Code configuration and delegates to the note
 * detection manager.
 *
 * @param input - Current document, note store, and optional changed line.
 * @returns Detection result for the current document.
 *
 * @example
 * const result = await checkCurrentDocumentNotes({ document, notes });
 */
export async function checkCurrentDocumentNotes(
  input: CheckCurrentDocumentNotesInput,
): Promise<SourceFileNoteCheckResult> {
  const { document, notes, changedStartLine } = input;

  if (changedStartLine !== undefined && (!Number.isInteger(changedStartLine) || changedStartLine < 1)) {
    throw new Error("changedStartLine must be a positive one-based line number.");
  }

  const resolvedRoot = resolveCzazaRootDirectory(document.uri);
  const relativeFilePath = getCzazaRelativePath(document.uri, resolvedRoot.rootDirectory);
  const settings = getCzazaSettings(document.uri);
  const sourceText = document.getText();
  const options = {
    programmingLanguage: document.languageId,
  };

  if (changedStartLine !== undefined) {
    return notes.detection.checkChangedSourceRangeNotes(
      resolvedRoot.rootDirectory,
      settings.outputDirectory,
      relativeFilePath,
      sourceText,
      {
        ...options,
        changedStartLine,
      },
    );
  }

  return notes.detection.checkEntireSourceFileNotes(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    relativeFilePath,
    sourceText,
    options,
  );
}
