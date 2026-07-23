/** Relocates one Section Note to a user-confirmed source range. */

import {
  updateProgrammingLanguage,
  updateSectionAnchorHash,
  updateSectionRange,
  updateSourceHash,
} from "@shared/services/notes/noteAnchorService";
import { updateSectionNoteStatus } from "@shared/services/notes/noteStatusService";
import { createSourceHash } from "@shared/utils/hashUtils";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";
import { getResourceFingerprint } from "../../resourceFingerprint/getResourceFingerprintService";
import * as vscode from "vscode";

export type RelocateSectionNoteInput = {
  uri: vscode.Uri;
  notes: WorkspaceNoteStore;
  sectionId: string;
  startLine: number;
  endLine: number;
};

/**
 * Updates a Section Note range, anchor hash, and anchor status atomically.
 *
 * @param input - Source resource, Note store, Section Note id, and target range.
 * @returns Promise that resolves after the relocated Note is persisted.
 */
export async function relocateSectionNoteService(
  input: RelocateSectionNoteInput,
): Promise<void> {
  const fingerprint = await getResourceFingerprint(input.uri);

  if (fingerprint.kind !== "text") {
    throw new Error("Section Notes can only be relocated inside a text file.");
  }

  const resolvedRoot = resolveCzazaRootDirectory(input.uri);
  const settings = getCzazaSettings(input.uri);
  const relativePath = getCzazaRelativePath(input.uri, resolvedRoot.rootDirectory);
  const sourceFile = await input.notes.cache.getSourceFile(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    relativePath,
  );
  const section = sourceFile?.sectionNotes.find((note) => note.id === input.sectionId);

  if (!sourceFile || !section) {
    throw new Error("The Section Note no longer exists.");
  }

  const now = new Date().toISOString();
  const range = { startLine: input.startLine, endLine: input.endLine };
  const lines = fingerprint.document.getText().split(/\r\n|\r|\n/);
  let next = updateSectionRange(
    updateProgrammingLanguage(
      updateSourceHash(sourceFile, fingerprint.hash),
      fingerprint.programmingLanguage,
    ),
    section.id,
    range,
    fingerprint.document.lineCount,
    now,
  );
  next = updateSectionAnchorHash(
    next,
    section.id,
    createSourceHash(lines.slice(range.startLine - 1, range.endLine).join("\n")),
    now,
  );
  next = updateSectionNoteStatus(
    next,
    section.id,
    { ...section.status, anchor: "confirmed" },
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
