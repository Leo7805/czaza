/**
 * Builds a file-note detail payload directly from stored notes.
 */

import * as path from "node:path";

import type { AIExplanation } from "@shared/models/ai/common";
import type { NoteStatus } from "@shared/models/domain/common";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import { resolveCzazaRootDirectory } from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";
import type {
  ResourceLineNoteContent,
  ResourceNoteContent,
  ResourceNotesResult,
  ResourceSectionNoteContent,
} from "./getResourceNotesService";
import * as vscode from "vscode";

/** Input for reading a stored Navigator file-note detail payload. */
export type GetStoredNavigatorFileNotesInput = {
  /** Current resource URI used to resolve the CZaza root. */
  currentUri: vscode.Uri;

  /** Shared workspace note store. */
  notes: WorkspaceNoteStore;

  /** CZaza-root-relative source path for the stored note entry. */
  relativePath: string;
};

/**
 * Returns a file detail payload without opening or statting the source file.
 */
export async function getStoredNavigatorFileNotes(
  input: GetStoredNavigatorFileNotesInput,
): Promise<ResourceNotesResult> {
  const resolvedRoot = resolveCzazaRootDirectory(input.currentUri);
  const settings = getCzazaSettings(input.currentUri);
  const sourceFile = await input.notes.cache.getSourceFile(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    input.relativePath,
  );

  if (!sourceFile) {
    throw new Error(`${input.relativePath} no longer has stored notes.`);
  }

  const fileNote = getNoteContent(
    sourceFile.fileNote?.userNote,
    sourceFile.fileNote?.aiExplanation,
    sourceFile.fileNote?.status,
  );
  const lineNote = getFirstLineNoteContent(sourceFile);

  return {
    kind: "file",
    name: path.basename(input.relativePath) || input.relativePath,
    relativePath: input.relativePath,
    projectRootName: path.basename(resolvedRoot.rootDirectory),
    ...(fileNote ? { fileNote } : {}),
    aiAction: hasFileSectionAiExplanation(sourceFile) ? "regenerate" : "generate",
    sectionNotes: getSectionNoteContents(sourceFile),
    ...(lineNote ? { activeLine: lineNote.line, lineNote } : {}),
  };
}

function hasFileSectionAiExplanation(sourceFile: StoredSourceFile): boolean {
  return Boolean(
    sourceFile.fileNote?.aiExplanation ||
      sourceFile.sectionNotes.some((section) => section.aiExplanation),
  );
}

function getSectionNoteContents(sourceFile: StoredSourceFile): ResourceSectionNoteContent[] {
  return sourceFile.sectionNotes.map((note) => ({
    id: note.id,
    title: note.title,
    ...(note.kind ? { kind: note.kind } : {}),
    startLine: note.range.startLine,
    endLine: note.range.endLine,
    status: note.status,
    ...(getNoteContent(note.userNote, note.aiExplanation, note.status) ?? {}),
  }));
}

function getFirstLineNoteContent(sourceFile: StoredSourceFile): ResourceLineNoteContent | undefined {
  const note = sourceFile.lineNotes[0];

  if (!note) {
    return undefined;
  }

  return {
    id: note.id,
    line: note.line,
    status: note.status,
    ...(getNoteContent(note.userNote, note.aiExplanation, note.status) ?? {}),
  };
}

function getNoteContent(
  userNote: string | undefined,
  aiExplanation: AIExplanation | undefined,
  status: NoteStatus | undefined,
): ResourceNoteContent | undefined {
  const hasUserNote = Boolean(userNote?.trim());
  const hasAiExplanation = Boolean(aiExplanation);

  if (!hasUserNote && !hasAiExplanation) {
    return undefined;
  }

  return {
    ...(hasUserNote ? { userNote } : {}),
    ...(hasAiExplanation ? { aiExplanation } : {}),
    ...(status ? { status } : {}),
  };
}
