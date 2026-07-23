/**
 * Reads detailed notes and compact directory previews for a VS Code resource.
 */

import * as path from "node:path";

import * as vscode from "vscode";

import type { AIExplanation } from "@shared/models/ai/common";
import type { NoteStatus } from "@shared/models/domain/common";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";
import type { UserNoteTarget } from "./saveUserNoteService";
import { compareSectionsForDisplay } from "./sectionSelection/sectionComparators";
import { getResourceFingerprint } from "./resourceFingerprint/getResourceFingerprintService";

/**
 * Single-line note preview for one resource.
 *
 * @example
 * const child: ResourceChildNotePreview = {
 *   kind: "file",
 *   name: "Button.tsx",
 *   relativePath: "src/Button.tsx",
 *   notePreview: "Renders the primary button.",
 * };
 */
export type ResourceChildNotePreview = {
  /** Resource kind reported by VS Code. */
  kind: "file" | "directory";

  /** Display name for the resource. */
  name: string;

  /** Normalized path relative to the configured CZaza root. */
  relativePath: string;

  /** Single-line note preview selected from user or AI notes. */
  notePreview: string;
};

/**
 * Complete user and AI content available for one detailed note card.
 *
 * @example
 * const content: ResourceNoteContent = {
 *   userNote: "Review this timeout.\nConfirm the default value.",
 *   aiExplanation: {
 *     summary: "Configures the request timeout.",
 *     detail: "The timeout is applied to each outgoing request.",
 *   },
 * };
 */
export type ResourceNoteContent = {
  /** Complete user-authored note content. */
  userNote?: string;

  /** Complete AI explanation content. */
  aiExplanation?: AIExplanation;

  /** Current content and source-anchor status for this note. */
  status?: NoteStatus;

  /** ISO 8601 timestamp for when this note was created. */
  createdAt?: string;

  /** ISO 8601 timestamp for when this note was last updated. */
  updatedAt?: string;
};

/**
 * Section note matched to the active source line.
 *
 * @example
 * const section: ResourceSectionNoteContent = {
 *   id: "section:request:10-20",
 *   title: "Send request",
 *   startLine: 10,
 *   endLine: 20,
 *   aiExplanation: { summary: "Sends the request.", detail: "Builds and sends it." },
 * };
 */
export type ResourceSectionNoteContent = ResourceNoteContent & {
  /** Stable section note identifier. */
  id: string;

  /** Human-readable section title. */
  title: string;

  /** Optional section category. */
  kind?: string;

  /** One-based inclusive start line. */
  startLine: number;

  /** One-based inclusive end line. */
  endLine: number;

  /** Creation time used as a deterministic overlap-selection tie-breaker. */
  createdAt?: string;
};

/**
 * Line note matched to the active source line.
 *
 * @example
 * const line: ResourceLineNoteContent = {
 *   id: "line:42",
 *   line: 42,
 *   userNote: "Important return value.",
 * };
 */
export type ResourceLineNoteContent = ResourceNoteContent & {
  /** Stable line note identifier. */
  id: string;

  /** One-based source line number. */
  line: number;
};

/**
 * Notes lookup result for one VS Code resource.
 *
 * @example
 * const result: ResourceNotesResult = {
 *   kind: "file",
 *   name: "index.ts",
 *   relativePath: "src/index.ts",
 *   fileNote: { aiExplanation: { summary: "Initializes the extension.", detail: "Registers features." } },
 *   sectionNotes: [],
 * };
 */
export type ResourceNotesResult =
  | {
      /** The selected resource is outside the configured CZaza root. */
      kind: "outsideRoot";
    }
  | {
      /** File resource notes. */
      kind: "file";

      /** File name shown in the UI. */
      name: string;

      /** Normalized path relative to the configured CZaza root. */
      relativePath: string;

      /** Name of the configured root used as the project scope label. */
      projectRootName?: string;

      /** Complete user and AI file-note content, when present. */
      fileNote?: ResourceNoteContent;

      /** AI action shown for combined file and section generation. */
      aiAction: "generate" | "regenerate";

      /** One-based active editor line used to orient line-level notes. */
      activeLine?: number;

      /** Distinct section notes containing the active line. */
      sectionNotes: ResourceSectionNoteContent[];

      /** First line note attached to the active line. */
      lineNote?: ResourceLineNoteContent;

      /** Optional target that the webview should open in User Note edit mode. */
      editTarget?: UserNoteTarget;
    }
  | {
      /** Binary file resource notes. */
      kind: "binary";

      name: string;
      relativePath: string;
      projectRootName?: string;
      fileNote?: ResourceNoteContent;
      editTarget?: { level: "file" };
    }
  | {
      /** Directory resource notes and first-level child previews. */
      kind: "directory";

      /** Directory name shown in the UI. */
      name: string;

      /** Normalized path relative to the configured CZaza root. */
      relativePath: string;

      /** Name of the configured root used as the project scope label. */
      projectRootName?: string;

      /** Complete directory-level file note content, when present. */
      fileNote?: ResourceNoteContent;

      /** First-level children that have file-level note previews. */
      children: ResourceChildNotePreview[];
    };

/**
 * Input used to read note previews for a VS Code resource.
 *
 * @example
 * const result = await getResourceNotes({ uri, notes });
 */
export type GetResourceNotesInput = {
  /** File or directory URI selected in VS Code. */
  uri: vscode.Uri;

  /** Shared workspace note store created during extension activation. */
  notes: WorkspaceNoteStore;

  /** Optional one-based active line used to select section and line notes. */
  activeLine?: number;
};

/**
 * Reads detailed file notes or compact directory previews for a resource.
 *
 * Directories are treated like resources with optional file-level notes. Their
 * children are scanned only one level deep, and child entries without a note
 * preview are omitted.
 *
 * @param input - Selected VS Code resource and note store.
 * @returns Resource note preview result, or `outsideRoot` for normal out-of-scope resources.
 *
 * @example
 * const result = await getResourceNotes({ uri: resourceUri, notes });
 */
export async function getResourceNotes(input: GetResourceNotesInput): Promise<ResourceNotesResult> {
  const { uri, notes, activeLine } = input;

  if (uri.scheme !== "file") {
    return { kind: "outsideRoot" };
  }

  try {
    const resolvedRoot = resolveCzazaRootDirectory(uri);
    const relativePath = getCzazaRelativePath(uri, resolvedRoot.rootDirectory);
    const settings = getCzazaSettings(uri);
    const sourceFile = await notes.cache.getSourceFile(
      resolvedRoot.rootDirectory,
      settings.outputDirectory,
      relativePath,
    );
    const fingerprint = await getResourceFingerprint(uri);

    if (fingerprint.kind === "directory") {
      const fileNote = getNoteContent(
        sourceFile?.fileNote?.userNote,
        sourceFile?.fileNote?.aiExplanation,
        sourceFile?.fileNote?.status,
      );

      return {
        kind: "directory",
        name: getResourceName(uri, relativePath),
        relativePath,
        projectRootName: path.basename(resolvedRoot.rootDirectory),
        ...(fileNote ? { fileNote } : {}),
        children: await getDirectoryChildNotePreviews(uri, notes, resolvedRoot.rootDirectory, settings.outputDirectory),
      };
    }

    const fileNote = getNoteContent(
      sourceFile?.fileNote?.userNote,
      sourceFile?.fileNote?.aiExplanation,
      sourceFile?.fileNote?.status,
      sourceFile?.fileNote?.createdAt,
      sourceFile?.fileNote?.updatedAt,
    );

    if (fingerprint.kind === "binary") {
      return {
        kind: "binary",
        name: getResourceName(uri, relativePath),
        relativePath,
        projectRootName: path.basename(resolvedRoot.rootDirectory),
        ...(fileNote ? { fileNote } : {}),
      };
    }

    const sectionNotes = getSectionNoteContents(sourceFile, activeLine);
    const lineNote = getLineNoteContent(sourceFile, activeLine);

    return {
      kind: "file",
      name: getResourceName(uri, relativePath),
      relativePath,
      projectRootName: path.basename(resolvedRoot.rootDirectory),
      ...(fileNote ? { fileNote } : {}),
      aiAction: hasFileSectionAiExplanation(sourceFile) ? "regenerate" : "generate",
      ...(isPositiveLine(activeLine) ? { activeLine } : {}),
      sectionNotes,
      ...(lineNote ? { lineNote } : {}),
    };
  } catch (error) {
    if (isOutsideRootError(error) || isMissingWorkspaceError(error)) {
      return { kind: "outsideRoot" };
    }

    throw error;
  }
}

function hasFileSectionAiExplanation(sourceFile: StoredSourceFile | undefined): boolean {
  return Boolean(
    sourceFile?.fileNote?.aiExplanation ||
      sourceFile?.sectionNotes.some((section) => section.aiExplanation),
  );
}

async function getDirectoryChildNotePreviews(
  directoryUri: vscode.Uri,
  notes: WorkspaceNoteStore,
  rootDirectory: string,
  outputDirectory: string,
): Promise<ResourceChildNotePreview[]> {
  const entries = await vscode.workspace.fs.readDirectory(directoryUri);
  const children: ResourceChildNotePreview[] = [];

  for (const [name, fileType] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    const childKind = toSupportedChildKind(fileType);

    if (!childKind) {
      continue;
    }

    const childUri = vscode.Uri.file(path.join(directoryUri.fsPath, name));
    const relativePath = getCzazaRelativePath(childUri, rootDirectory);
    const sourceFile = await notes.cache.getSourceFile(rootDirectory, outputDirectory, relativePath);
    const notePreview = getFileNotePreview(sourceFile);

    if (!notePreview) {
      continue;
    }

    children.push({
      kind: childKind,
      name,
      relativePath,
      notePreview,
    });
  }

  return children;
}

function getFileNotePreview(sourceFile: StoredSourceFile | undefined): string | undefined {
  const fileNote = sourceFile?.fileNote;

  return getFirstLine(fileNote?.userNote) ?? getAiPreview(fileNote?.aiExplanation);
}

function getSectionNoteContents(
  sourceFile: StoredSourceFile | undefined,
  activeLine: number | undefined,
): ResourceSectionNoteContent[] {
  if (!isPositiveLine(activeLine)) {
    return [];
  }

  return (sourceFile?.sectionNotes ?? [])
    .map((note, index) => ({ note, index }))
    .filter(({ note }) => note.range.startLine <= activeLine && note.range.endLine >= activeLine)
    .sort(
      (left, right) =>
        compareSectionsForDisplay(
          {
            id: left.note.id,
            title: left.note.title,
            startLine: left.note.range.startLine,
            endLine: left.note.range.endLine,
            createdAt: left.note.createdAt,
          },
          {
            id: right.note.id,
            title: right.note.title,
            startLine: right.note.range.startLine,
            endLine: right.note.range.endLine,
            createdAt: right.note.createdAt,
          },
        ) || left.index - right.index,
    )
    .map(({ note }) => ({
      id: note.id,
      title: note.title,
      ...(note.kind ? { kind: note.kind } : {}),
      startLine: note.range.startLine,
      endLine: note.range.endLine,
      createdAt: note.createdAt,
      status: note.status,
      ...(getNoteContent(note.userNote, note.aiExplanation, note.status) ?? {}),
    }));
}

function getLineNoteContent(
  sourceFile: StoredSourceFile | undefined,
  activeLine: number | undefined,
): ResourceLineNoteContent | undefined {
  if (!isPositiveLine(activeLine)) {
    return undefined;
  }

  const note = sourceFile?.lineNotes.find((candidate) => candidate.line === activeLine);

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
  createdAt?: string,
  updatedAt?: string,
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
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function getAiPreview(aiExplanation: AIExplanation | undefined): string | undefined {
  return (
    getFirstLine(aiExplanation?.summary) ??
    getFirstLine(aiExplanation?.aiNotes?.[0]) ??
    getFirstLine(aiExplanation?.detail)
  );
}

function isPositiveLine(line: number | undefined): line is number {
  return Number.isInteger(line) && (line ?? 0) > 0;
}

function toSupportedChildKind(fileType: vscode.FileType): ResourceChildNotePreview["kind"] | undefined {
  if (fileType & vscode.FileType.Directory) {
    return "directory";
  }

  if (fileType & vscode.FileType.File) {
    return "file";
  }

  return undefined;
}

function getFirstLine(value: string | undefined): string | undefined {
  const firstLine = value?.split(/\r?\n/).map((line) => line.trim()).find(Boolean);

  return firstLine || undefined;
}

function getResourceName(uri: vscode.Uri, relativePath: string): string {
  return path.basename(uri.fsPath) || relativePath || ".";
}

function isOutsideRootError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("outside the configured CZaza root");
}

function isMissingWorkspaceError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("requires an open VS Code workspace folder");
}
