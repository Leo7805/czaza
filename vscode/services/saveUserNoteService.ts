/**
 * Saves file, section, and line user notes through the current workspace note store.
 */

import * as vscode from "vscode";

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { createCurrentConfirmedStatus } from "@shared/models/domain/common";
import { createStoredSourceFile } from "@shared/services/domainToStoreService";
import { createAvailableLineNoteId } from "@shared/services/notes/lineNoteIdentityService";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";
import { getResourceFingerprint } from "./resourceFingerprint/getResourceFingerprintService";

/**
 * Note target accepted by the shared user-note editor.
 *
 * @example
 * const target: UserNoteTarget = { level: "section", sectionId: "section:1" };
 */
export type UserNoteTarget =
  | { level: "file" }
  | { level: "section"; sectionId: string }
  | { level: "line"; line: number };

/**
 * Input required to save one user note.
 */
export type SaveUserNoteInput = {
  /** Local source-file URI that owns the note. */
  uri: vscode.Uri;

  /** Shared workspace note store used for reads and persistent writes. */
  notes: WorkspaceNoteStore;

  /** File, section, or line target selected in the Webview. */
  target: UserNoteTarget;

  /** Complete user-authored note text. */
  userNote: string;
};

/**
 * Saves one user note while preserving existing AI content and note metadata.
 *
 * Missing source-file storage is initialized for non-empty file and line notes.
 * Sections must already exist because their source range cannot be inferred from
 * an empty card.
 *
 * @param input - Resource, note store, target, and complete user note text.
 * @returns Promise that resolves after the note and cache are updated.
 *
 * @example
 * await saveUserNoteService({
 *   uri: document.uri,
 *   notes,
 *   target: { level: "line", line: 42 },
 *   userNote: "Check this return value.",
 * });
 */
export async function saveUserNoteService(input: SaveUserNoteInput): Promise<void> {
  const fingerprint = await getResourceFingerprint(input.uri);
  const resourceKind = fingerprint.kind === "directory" ? "directory" : "file";

  if (resourceKind === "directory" && input.target.level !== "file") {
    throw new Error("Directory resources only support file-level user notes.");
  }

  if (fingerprint.kind === "binary" && input.target.level !== "file") {
    throw new Error("Binary resources only support file-level user notes.");
  }

  const document = fingerprint.kind === "text" ? fingerprint.document : undefined;
  const resolvedRoot = resolveCzazaRootDirectory(input.uri);
  const relativePath = getCzazaRelativePath(input.uri, resolvedRoot.rootDirectory);
  const settings = getCzazaSettings(input.uri);
  const now = new Date().toISOString();
  const userNote = normalizeUserNote(input.userNote);
  let sourceFile = await input.notes.cache.getSourceFile(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    relativePath,
  );

  if (!sourceFile && input.target.level === "section") {
    throw new Error(`Section note no longer exists: ${input.target.sectionId}`);
  }

  if (!sourceFile && !userNote) {
    return;
  }

  if (
    input.target.level === "line" &&
    (!Number.isInteger(input.target.line) ||
      input.target.line < 1 ||
      (!document || input.target.line > document.lineCount))
  ) {
    throw new Error(`Line ${input.target.line} is outside the current document.`);
  }

  if (!sourceFile) {
    sourceFile = createStoredSourceFile({
      sourceCode: document?.getText() ?? "",
      ...(fingerprint.kind !== "directory" ? { sourceHash: fingerprint.hash } : {}),
      ...(fingerprint.kind === "text" ? { sourceHashKind: "text" as const } : {}),
      ...(fingerprint.kind === "binary" ? { sourceHashKind: "metadata" as const } : {}),
      ...(document ? { programmingLanguage: document.languageId } : {}),
      now,
    });
    await input.notes.cache.saveSourceFile(
      resolvedRoot.rootDirectory,
      settings.outputDirectory,
      relativePath,
      sourceFile,
      now,
    );
  }

  const location = {
    workspaceRoot: resolvedRoot.rootDirectory,
    outputDirectory: settings.outputDirectory,
    relativePath,
    now,
  };

  if (input.target.level === "file") {
    await saveFileUserNote(input.notes, sourceFile, location, userNote);
    return;
  }

  if (input.target.level === "section") {
    await saveSectionUserNote(input.notes, sourceFile, location, input.target.sectionId, userNote);
    return;
  }

  if (!document) {
    throw new Error("Line user notes require a text document.");
  }

  await saveLineUserNote(
    input.notes,
    sourceFile,
    location,
    document,
    input.target.line,
    userNote,
  );
}

type NoteLocation = {
  workspaceRoot: string;
  outputDirectory: string;
  relativePath: string;
  now: string;
};

async function saveFileUserNote(
  notes: WorkspaceNoteStore,
  sourceFile: StoredSourceFile,
  location: NoteLocation,
  userNote: string | undefined,
): Promise<void> {
  const existing = sourceFile.fileNote;

  if (!existing && !userNote) {
    return;
  }

  const next = existing
    ? replaceUserNote(existing, userNote)
    : {
        id: "file",
        userNote,
        status: createCurrentConfirmedStatus(),
        createdBy: "user" as const,
      };

  await notes.crud.upsertFileNote(
    location.workspaceRoot,
    location.outputDirectory,
    location.relativePath,
    next,
    location.now,
  );
}

async function saveSectionUserNote(
  notes: WorkspaceNoteStore,
  sourceFile: StoredSourceFile,
  location: NoteLocation,
  sectionId: string,
  userNote: string | undefined,
): Promise<void> {
  const existing = sourceFile.sectionNotes.find((section) => section.id === sectionId);

  if (!existing) {
    throw new Error(`Section note no longer exists: ${sectionId}`);
  }

  if (shouldDeleteUserOnlyNote(existing, userNote)) {
    await notes.crud.deleteSectionNote(
      location.workspaceRoot,
      location.outputDirectory,
      location.relativePath,
      sectionId,
      location.now,
    );
    return;
  }

  await notes.crud.upsertSectionNote(
    location.workspaceRoot,
    location.outputDirectory,
    location.relativePath,
    replaceUserNote(existing, userNote),
    location.now,
  );
}

async function saveLineUserNote(
  notes: WorkspaceNoteStore,
  sourceFile: StoredSourceFile,
  location: NoteLocation,
  document: vscode.TextDocument,
  line: number,
  userNote: string | undefined,
): Promise<void> {
  if (!Number.isInteger(line) || line < 1 || line > document.lineCount) {
    throw new Error(`Line ${line} is outside the current document.`);
  }

  const existing = sourceFile.lineNotes.find((note) => note.line === line);

  if (!existing && !userNote) {
    return;
  }

  const next = existing
    ? replaceUserNote(existing, userNote)
    : {
        id: createAvailableLineNoteId(
          line,
          sourceFile.lineNotes.map((note) => note.id),
        ),
        line,
        anchorText: document.lineAt(line - 1).text,
        userNote,
        status: createCurrentConfirmedStatus(),
        createdBy: "user" as const,
      };

  if (existing && shouldDeleteUserOnlyNote(existing, userNote)) {
    await notes.crud.deleteLineNote(
      location.workspaceRoot,
      location.outputDirectory,
      location.relativePath,
      existing.id,
      location.now,
    );
    return;
  }

  await notes.crud.upsertLineNote(
    location.workspaceRoot,
    location.outputDirectory,
    location.relativePath,
    next,
    location.now,
  );
}

function replaceUserNote<TNote extends { userNote?: string }>(
  note: TNote,
  userNote: string | undefined,
): TNote {
  const next = { ...note };
  delete next.userNote;

  if (userNote) {
    next.userNote = userNote;
  }

  return next;
}

function shouldDeleteUserOnlyNote<TNote extends { aiExplanation?: unknown }>(
  note: TNote,
  userNote: string | undefined,
): boolean {
  return !userNote && !note.aiExplanation;
}

function normalizeUserNote(value: string): string | undefined {
  return value.trim() ? value : undefined;
}
