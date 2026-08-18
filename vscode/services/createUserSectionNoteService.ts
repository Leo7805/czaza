/**
 * Creates a user-owned Section Note when a non-empty draft is saved.
 */

import * as vscode from "vscode";

import { createCurrentConfirmedStatus } from "@shared/models/domain/common";
import type { SectionNote } from "@shared/models/domain/section";
import { createStoredSourceFile } from "@shared/services/domainToStoreService";
import { createSourceHash } from "@shared/utils/hashUtils";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import type { NoteStoreLocation, WorkspaceNoteStore } from "@vscode/notes";

/** Input required to create or reuse a user Section Note. */
export type CreateUserSectionNoteInput = {
  /** Source document that owns the selected range. */
  document: vscode.TextDocument;

  /** Shared workspace note store. */
  notes: WorkspaceNoteStore;

  /** One-based inclusive start line. */
  startLine: number;

  /** One-based inclusive end line. */
  endLine: number;

  /** Team or Personal Store receiving the new Section Note. */
  location?: NoteStoreLocation;

  /** Complete user-authored content saved from the Section draft. */
  userNote: string;
};

/**
 * Updates an exact-range Section Note or creates it when a non-empty draft is saved.
 *
 * @param input - Document, note store, and selected one-based line range.
 * @returns Stable identifier of the saved Section Note, or undefined for an empty draft.
 * @throws When the selected range is invalid or outside the document.
 *
 * @example
 * const sectionId = await createUserSectionNoteService({
 *   document,
 *   notes,
 *   startLine: 10,
 *   endLine: 20,
 *   userNote: "Review this section.",
 * });
 */
export async function createUserSectionNoteService(
  input: CreateUserSectionNoteInput,
): Promise<string | undefined> {
  assertValidRange(input.startLine, input.endLine, input.document.lineCount);

  if (!input.userNote.trim()) {
    return undefined;
  }

  const resolvedRoot = resolveCzazaRootDirectory(input.document.uri);
  const settings = getCzazaSettings(input.document.uri);
  const relativePath = getCzazaRelativePath(input.document.uri, resolvedRoot.rootDirectory);
  const sourceFile = await input.notes.cache.getSourceFile(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    relativePath,
    input.location,
  );
  const existing = sourceFile?.sectionNotes.find(
    (section) =>
      section.range.startLine === input.startLine && section.range.endLine === input.endLine,
  );

  if (existing) {
    await input.notes.crud.upsertSectionNote(
      resolvedRoot.rootDirectory,
      settings.outputDirectory,
      relativePath,
      { ...existing, userNote: input.userNote },
      new Date().toISOString(),
      input.location,
    );
    return existing.id;
  }

  const now = new Date().toISOString();
  const sectionId = createSectionId(
    input.startLine,
    input.endLine,
    sourceFile?.sectionNotes.map((section) => section.id) ?? [],
  );
  const sectionNote: SectionNote = {
    id: sectionId,
    title: "",
    range: {
      startLine: input.startLine,
      endLine: input.endLine,
    },
    anchorHash: createSourceHash(getRangeText(input.document, input.startLine, input.endLine)),
    status: createCurrentConfirmedStatus(),
    createdBy: "user",
    userNote: input.userNote,
  };

  if (!sourceFile) {
    const nextSourceFile = createStoredSourceFile({
      sourceCode: input.document.getText(),
      programmingLanguage: input.document.languageId,
      sectionNotes: [sectionNote],
      now,
    });
    await input.notes.cache.saveSourceFile(
      resolvedRoot.rootDirectory,
      settings.outputDirectory,
      relativePath,
      nextSourceFile,
      now,
      {},
      input.location,
    );
    return sectionId;
  }

  await input.notes.crud.upsertSectionNote(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    relativePath,
    sectionNote,
    now,
    input.location,
  );

  return sectionId;
}

function assertValidRange(startLine: number, endLine: number, lineCount: number): void {
  if (
    !Number.isInteger(startLine) ||
    !Number.isInteger(endLine) ||
    startLine < 1 ||
    startLine > endLine ||
    endLine > lineCount
  ) {
    throw new Error("Section range is outside the current document.");
  }
}

function createSectionId(startLine: number, endLine: number, usedIds: Iterable<string>): string {
  const used = new Set(usedIds);
  const baseId = `section:user:${startLine}-${endLine}`;

  if (!used.has(baseId)) {
    return baseId;
  }

  let suffix = 1;
  while (used.has(`${baseId}:${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}:${suffix}`;
}

function getRangeText(document: vscode.TextDocument, startLine: number, endLine: number): string {
  const start = new vscode.Position(startLine - 1, 0);
  const lastLine = document.lineAt(endLine - 1);
  const end = new vscode.Position(endLine - 1, lastLine.text.length);
  return document.getText(new vscode.Range(start, end));
}
