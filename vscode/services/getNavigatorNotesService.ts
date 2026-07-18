/** Reads the complete data required by the Notes Navigator lists. */

import * as path from "node:path";

import type { AIExplanation } from "@shared/models/ai/common";
import type { NoteStatus } from "@shared/models/domain/common";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";
import { ensureFileNoteResourceAvailability } from "./ensureFileNoteResourceAvailabilityService";
import * as vscode from "vscode";

/** Compact note content used by one Navigator list item. */
export type NavigatorNoteContent = {
  /** Complete user-authored note, when present. */
  userNote?: string;

  /** Complete AI explanation, when present. */
  aiExplanation?: AIExplanation;

  /** One-line preview shown in the compact list. */
  preview: string;

  /** Current content and source-anchor status for this note. */
  status?: NoteStatus;
};

/** One file note shown in the project-wide Files list. */
export type NavigatorFileItem = NavigatorNoteContent & {
  /** Root-relative source path used as the stable navigation target. */
  relativePath: string;

  /** Whether the note target is a file or directory. */
  resourceKind: "file" | "directory";

  /** File name shown in the list. */
  name: string;
};

/** One section note shown in the current-file Sections list. */
export type NavigatorSectionItem = NavigatorNoteContent & {
  /** Stable section identifier. */
  id: string;

  /** Section title, when one was supplied. */
  title: string;

  /** One-based inclusive first line. */
  startLine: number;

  /** One-based inclusive last line. */
  endLine: number;
};

/** One line note shown in the current-file Lines list. */
export type NavigatorLineItem = NavigatorNoteContent & {
  /** Stable line-note identifier. */
  id: string;

  /** One-based source line number. */
  line: number;
};

/** Complete data displayed by Navigator Mode. */
export type NavigatorNotesResult =
  | { kind: "empty" }
  | { kind: "outsideRoot" }
  | {
      kind: "resource";
      projectRootName: string;
      currentResource?: string;
      currentFile?: string;
      activeSectionId?: string;
      activeLine?: number;
      files: NavigatorFileItem[];
      sections: NavigatorSectionItem[];
      lines: NavigatorLineItem[];
    };

/** Input for reading Navigator lists. */
export type GetNavigatorNotesInput = {
  /** Current file or directory resource. */
  uri?: vscode.Uri;

  /** Shared workspace note store and cache. */
  notes: WorkspaceNoteStore;

  /** Currently selected Section Note in the detail view, when any. */
  selectedSectionId?: string;

  /** Current one-based editor line, when any. */
  activeLine?: number;
};

/**
 * Reads project File Notes and all Section/Line Notes for the current file.
 *
 * @param input - Current resource and shared note store.
 * @returns Complete list data for Navigator Mode.
 *
 * @example
 * const result = await getNavigatorNotes({ uri, notes });
 */
export async function getNavigatorNotes({
  uri,
  notes,
  selectedSectionId,
  activeLine,
}: GetNavigatorNotesInput): Promise<NavigatorNotesResult> {
  if (!uri) {
    return { kind: "empty" };
  }

  try {
    const resolvedRoot = resolveCzazaRootDirectory(uri);
    const settings = getCzazaSettings(uri);
    const relativePath = getCzazaRelativePath(uri, resolvedRoot.rootDirectory);
    const index = await notes.cache.loadIndex(resolvedRoot.rootDirectory, settings.outputDirectory);
    const files = await getFileItems(
      notes,
      resolvedRoot.rootDirectory,
      settings.outputDirectory,
      index?.files ?? {},
    );
    const sourceFile = await notes.cache.getSourceFile(
      resolvedRoot.rootDirectory,
      settings.outputDirectory,
      relativePath,
    );
    const resourceKind = await getResourceKind(uri);

    return {
      kind: "resource",
      projectRootName: path.basename(resolvedRoot.rootDirectory),
      currentResource: relativePath,
      ...(resourceKind === "file" ? { currentFile: relativePath } : {}),
      ...(resourceKind === "file" && selectedSectionId ? { activeSectionId: selectedSectionId } : {}),
      ...(resourceKind === "file" && isPositiveLine(activeLine) ? { activeLine } : {}),
      files,
      sections: resourceKind === "file" ? getSectionItems(sourceFile) : [],
      lines: resourceKind === "file" ? getLineItems(sourceFile) : [],
    };
  } catch (error) {
    if (isExpectedResourceError(error)) {
      return { kind: "outsideRoot" };
    }

    throw error;
  }
}

async function getFileItems(
  notes: WorkspaceNoteStore,
  workspaceRoot: string,
  outputDirectory: string,
  entries: Record<string, { noteFile: string }>,
): Promise<NavigatorFileItem[]> {
  const items: NavigatorFileItem[] = [];

  for (const relativePath of Object.keys(entries).sort((left, right) => left.localeCompare(right))) {
    const availability = await ensureFileNoteResourceAvailability({
      notes,
      workspaceRoot,
      outputDirectory,
      relativePath,
      now: new Date().toISOString(),
    });
    const sourceFile = await notes.cache.getSourceFile(workspaceRoot, outputDirectory, relativePath);
    const content = getNoteContent(
      sourceFile?.fileNote?.userNote,
      sourceFile?.fileNote?.aiExplanation,
      relativePath,
      sourceFile?.fileNote?.status,
    );

    if (!content) {
      continue;
    }

    items.push({
      relativePath,
      resourceKind: availability.available
        ? await getNavigatorResourceKind(workspaceRoot, relativePath)
        : "file",
      name: path.basename(relativePath),
      ...content,
    });
  }

  return items;
}

function getSectionItems(sourceFile: StoredSourceFile | undefined): NavigatorSectionItem[] {
  return (sourceFile?.sectionNotes ?? [])
    .map((note, index) => ({ note, index }))
    .sort(
      (left, right) =>
        left.note.range.startLine - right.note.range.startLine || left.index - right.index,
    )
    .map(({ note }) => ({
      id: note.id,
      title: note.title,
      startLine: note.range.startLine,
      endLine: note.range.endLine,
      ...(getNoteContent(note.userNote, note.aiExplanation, note.title, note.status) ?? {
        preview: note.title || "Untitled section",
        status: note.status,
      }),
    }));
}

function getLineItems(sourceFile: StoredSourceFile | undefined): NavigatorLineItem[] {
  return (sourceFile?.lineNotes ?? [])
    .map((note, index) => ({ note, index }))
    .sort((left, right) => left.note.line - right.note.line || left.index - right.index)
    .map(({ note }) => ({
      id: note.id,
      line: note.line,
      ...(getNoteContent(note.userNote, note.aiExplanation, `Line ${note.line}`, note.status) ?? {
        preview: `Line ${note.line}`,
        status: note.status,
      }),
    }));
}

function getNoteContent(
  userNote: string | undefined,
  aiExplanation: AIExplanation | undefined,
  fallback: string,
  status: NoteStatus | undefined,
): NavigatorNoteContent | undefined {
  const preview = getFirstLine(userNote) ?? getAiPreview(aiExplanation) ?? fallback;

  if (!userNote?.trim() && !aiExplanation) {
    return undefined;
  }

  return {
    ...(userNote?.trim() ? { userNote } : {}),
    ...(aiExplanation ? { aiExplanation } : {}),
    preview,
    ...(status ? { status } : {}),
  };
}

function getAiPreview(aiExplanation: AIExplanation | undefined): string | undefined {
  return (
    getFirstLine(aiExplanation?.summary) ??
    getFirstLine(aiExplanation?.aiNotes?.[0]) ??
    getFirstLine(aiExplanation?.detail)
  );
}

function getFirstLine(value: string | undefined): string | undefined {
  const line = value?.split(/\r?\n/).map((item) => item.trim()).find(Boolean);
  return line || undefined;
}

async function getResourceKind(uri: vscode.Uri): Promise<"file" | "directory"> {
  const stat = await vscode.workspace.fs.stat(uri);
  return stat.type & vscode.FileType.Directory ? "directory" : "file";
}

async function getNavigatorResourceKind(
  workspaceRoot: string,
  relativePath: string,
): Promise<"file" | "directory"> {
  try {
    return await getResourceKind(vscode.Uri.file(path.join(workspaceRoot, ...relativePath.split("/"))));
  } catch {
    return "file";
  }
}

function isPositiveLine(value: number | undefined): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isExpectedResourceError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("outside the configured CZaza root") ||
      error.message.includes("requires an open VS Code workspace folder"))
  );
}
