/** Relocates one Line Note to a user-confirmed source line. */

import {
  updateLineAnchorText,
  updateLineNumber,
  updateProgrammingLanguage,
  updateSourceHash,
} from "@shared/services/notes/noteAnchorService";
import { updateLineNoteStatus } from "@shared/services/notes/noteStatusService";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";
import { getResourceFingerprint } from "../../resourceFingerprint/getResourceFingerprintService";
import * as vscode from "vscode";

export type RelocateLineNoteInput = {
  uri: vscode.Uri;
  notes: WorkspaceNoteStore;
  lineId: string;
  line: number;
};

/**
 * Updates a Line Note number, anchor text, and anchor status atomically.
 *
 * @param input - Source resource, Note store, Line Note id, and target line.
 * @returns Promise that resolves after the relocated Note is persisted.
 */
export async function relocateLineNoteService(input: RelocateLineNoteInput): Promise<void> {
  const fingerprint = await getResourceFingerprint(input.uri);

  if (fingerprint.kind !== "text") {
    throw new Error("Line Notes can only be relocated inside a text file.");
  }

  const resolvedRoot = resolveCzazaRootDirectory(input.uri);
  const settings = getCzazaSettings(input.uri);
  const relativePath = getCzazaRelativePath(input.uri, resolvedRoot.rootDirectory);
  const sourceFile = await input.notes.cache.getSourceFile(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    relativePath,
  );
  const lineNote = sourceFile?.lineNotes.find((note) => note.id === input.lineId);

  if (!sourceFile || !lineNote) {
    throw new Error("The Line Note no longer exists.");
  }

  const conflictingNote = sourceFile.lineNotes.find(
    (note) => note.id !== lineNote.id && note.line === input.line,
  );

  if (conflictingNote) {
    throw new Error(`Line ${input.line} already has another Line Note.`);
  }

  const now = new Date().toISOString();
  let next = updateLineNumber(
    updateProgrammingLanguage(
      updateSourceHash(sourceFile, fingerprint.hash),
      fingerprint.programmingLanguage,
    ),
    lineNote.id,
    input.line,
    fingerprint.document.lineCount,
    now,
  );
  const targetText = fingerprint.document.lineAt(input.line - 1).text;
  next = updateLineAnchorText(next, lineNote.id, targetText, now);
  next = updateLineNoteStatus(
    next,
    lineNote.id,
    { ...lineNote.status, anchor: "confirmed" },
    now,
  );

  await input.notes.cache.saveSourceFile(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    relativePath,
    next,
    now,
  );
}
