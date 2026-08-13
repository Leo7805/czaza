/**
 * Validates and persists AI Agent note changes through the shared Note Store.
 */

import path from "node:path";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  createFileNoteFromAiAnalysis,
  createLineNoteFromAiAnalysis,
  createSectionNoteId,
  createSectionNoteFromAiAnalysis,
} from "@shared/services/aiToDomainService";
import {
  createStoredFileNote,
  createStoredLineNote,
  createStoredSectionNote,
} from "@shared/services/domainToStoreService";
import { createAvailableLineNoteId } from "@shared/services/notes/lineNoteIdentityService";
import {
  updateFileAiExplanation,
  updateLineAiExplanation,
  updateSectionAiExplanation,
} from "@shared/services/notes/noteContentService";
import { createSourceHash } from "@shared/utils/hashUtils";
import {
  isCzazaNoteStoreRelativePath,
  isPathInsideDirectory,
} from "@shared/utils/managedOutputPath";
import { WorkspaceNoteStore } from "@vscode/notes";
import type { AgentNoteIdentityLookup } from "./agentNoteOwner";
import { resolveAgentNoteOwner } from "./agentNoteOwner";
import { createAgentNoteConfirmationToken } from "./createAgentNoteUpdateConfirmation";
import type {
  AgentNoteChange,
  AgentNoteChangeResult,
  AgentNoteUpdateReport,
  ApplyAgentNoteUpdatesInput,
} from "./agentNoteTypes";

/**
 * Applies validated Agent-authored AI Note content without exposing store files.
 *
 * @param input - Workspace and per-file note changes to apply.
 * @param notes - Shared Note Store used for reads and one save per changed file.
 * @param now - Timestamp factory used for persisted note metadata.
 * @returns Per-file change results and aggregate counts.
 */
export async function applyAgentNoteUpdates(
  input: ApplyAgentNoteUpdatesInput,
  notes = new WorkspaceNoteStore(),
  now = (): string => new Date().toISOString(),
  identities?: AgentNoteIdentityLookup,
): Promise<AgentNoteUpdateReport> {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const owner = await resolveAgentNoteOwner(workspaceRoot, input.outputDirectory, input.location, identities);
  const { confirmationToken: _confirmationToken, ...plan } = input;
  if (input.confirmationToken !== createAgentNoteConfirmationToken(plan)) {
    throw new Error("Agent Note update confirmation does not match the current plan.");
  }
  const files: AgentNoteUpdateReport["files"] = [];

  for (const request of input.files) {
    const sourcePath = normalizeSourcePath(workspaceRoot, request.sourcePath);

    if (
      !sourcePath ||
      isCzazaNoteStoreRelativePath(workspaceRoot, input.outputDirectory, sourcePath)
    ) {
      files.push(createRejectedFileResult(request, "Source path is outside the workspace."));
      continue;
    }

    let sourceText: string;

    try {
      sourceText = await readFile(path.resolve(workspaceRoot, sourcePath), "utf8");
    } catch {
      files.push(createRejectedFileResult(request, "Source file could not be read."));
      continue;
    }

    const sourceHash = createSourceHash(sourceText);

    if (sourceHash !== request.expectedSourceHash) {
      files.push(createRejectedFileResult(request, "Source hash changed after inspection."));
      continue;
    }

    const sourceFile = await notes.cache.getSourceFile(
      workspaceRoot,
      input.outputDirectory,
      sourcePath,
      input.location,
    );

    if (!sourceFile) {
      files.push(createRejectedFileResult(request, "Source file has no valid Note Store record."));
      continue;
    }

    const timestamp = now();
    const applied = applyFileChanges(sourceFile, sourceText, request.changes, timestamp);

    if (applied.changed) {
      await notes.cache.saveSourceFile(
        workspaceRoot,
        input.outputDirectory,
        sourcePath,
        {
          ...applied.sourceFile,
          source: { ...applied.sourceFile.source, sourceHash },
        },
        timestamp,
        {},
        input.location,
      );
    }

    files.push({ sourcePath, changes: applied.results });
  }

  return { owner, files, summary: summarizeResults(files) };
}

/** Applies one source file's valid requests in memory before one persistence call. */
function applyFileChanges(
  initial: StoredSourceFile,
  sourceText: string,
  changes: AgentNoteChange[],
  now: string,
): { sourceFile: StoredSourceFile; results: AgentNoteChangeResult[]; changed: boolean } {
  let sourceFile = initial;
  const results: AgentNoteChangeResult[] = [];
  const sourceLines = sourceText.split(/\r?\n/);

  for (const change of changes) {
    const invalidReason = validateChangeContent(change);

    if (invalidReason) {
      results.push(createResult(change, "failed", invalidReason));
      continue;
    }

    try {
      const applied = applyOneChange(sourceFile, sourceLines, change, now);
      sourceFile = applied.sourceFile;
      results.push(applied.result);
    } catch (error) {
      results.push(createResult(change, "failed", getErrorMessage(error)));
    }
  }

  return {
    sourceFile,
    results,
    changed: results.some((result) => result.action === "updated" || result.action === "created"),
  };
}

/** Applies one validated change to an in-memory source-file note document. */
function applyOneChange(
  sourceFile: StoredSourceFile,
  sourceLines: string[],
  change: AgentNoteChange,
  now: string,
): { sourceFile: StoredSourceFile; result: AgentNoteChangeResult } {
  if (change.action === "update") {
    const existing = findNote(sourceFile, change.level, change.noteId);
    if (!existing) return { sourceFile, result: createResult(change, "failed", "Note ID was not found at the requested level.") };
    if (isDeepStrictEqual(existing.aiExplanation, change.aiExplanation)) {
      return { sourceFile, result: createResult(change, "skipped", "AI explanation is unchanged.") };
    }

    const updated = updateExplanation(sourceFile, change, now);
    return {
      sourceFile: markUpdatedNoteCurrent(updated, change.level, change.noteId),
      result: createResult(change, "updated", change.reason, change.noteId),
    };
  }

  if (change.level === "file") {
    if (sourceFile.fileNote) return { sourceFile, result: createResult(change, "failed", "A File Note already exists.") };
    const note = createStoredFileNote(createFileNoteFromAiAnalysis(change.aiExplanation), now);
    return { sourceFile: { ...sourceFile, fileNote: note }, result: createResult(change, "created", change.reason, note.id) };
  }

  if (change.level === "section") {
    const index = findAvailableSectionIndex(sourceFile, change.title, change.range);
    const note = createStoredSectionNote(createSectionNoteFromAiAnalysis({
      title: change.title.trim(),
      ...(change.kind?.trim() ? { kind: change.kind.trim() } : {}),
      range: change.range,
      ...change.aiExplanation,
    }, sourceLines, index), now);
    return {
      sourceFile: { ...sourceFile, sectionNotes: [...sourceFile.sectionNotes, note].sort(compareSections) },
      result: createResult(change, "created", change.reason, note.id),
    };
  }

  const generated = createLineNoteFromAiAnalysis(change.line, change.aiExplanation, sourceLines);
  const note = createStoredLineNote({
    ...generated,
    id: createAvailableLineNoteId(change.line, sourceFile.lineNotes.map((item) => item.id)),
  }, now);
  return {
    sourceFile: { ...sourceFile, lineNotes: [...sourceFile.lineNotes, note].sort(compareLines) },
    result: createResult(change, "created", change.reason, note.id),
  };
}

/** Finds a note only at the requested attachment level. */
function findNote(sourceFile: StoredSourceFile, level: "file" | "section" | "line", noteId: string) {
  if (level === "file") return sourceFile.fileNote?.id === noteId ? sourceFile.fileNote : undefined;
  if (level === "section") return sourceFile.sectionNotes.find((note) => note.id === noteId);
  return sourceFile.lineNotes.find((note) => note.id === noteId);
}

/** Reuses pure content helpers to replace only one note's AI explanation. */
function updateExplanation(sourceFile: StoredSourceFile, change: Extract<AgentNoteChange, { action: "update" }>, now: string): StoredSourceFile {
  if (change.level === "file") return updateFileAiExplanation(sourceFile, change.aiExplanation, now);
  if (change.level === "section") return updateSectionAiExplanation(sourceFile, change.noteId, change.aiExplanation, now);
  return updateLineAiExplanation(sourceFile, change.noteId, change.aiExplanation, now);
}

/** Marks only a successfully updated note as current and confirmed. */
function markUpdatedNoteCurrent(sourceFile: StoredSourceFile, level: "file" | "section" | "line", noteId: string): StoredSourceFile {
  const status = { content: "current" as const, anchor: "confirmed" as const };
  if (level === "file" && sourceFile.fileNote?.id === noteId) return { ...sourceFile, fileNote: { ...sourceFile.fileNote, status } };
  if (level === "section") return { ...sourceFile, sectionNotes: sourceFile.sectionNotes.map((note) => note.id === noteId ? { ...note, status } : note) };
  return { ...sourceFile, lineNotes: sourceFile.lineNotes.map((note) => note.id === noteId ? { ...note, status } : note) };
}

/** Validates Agent-authored text fields before changing in-memory notes. */
function validateChangeContent(change: AgentNoteChange): string | undefined {
  if (!change.reason.trim()) return "Change reason must not be empty.";
  if (!change.aiExplanation.summary.trim()) return "AI explanation summary must not be empty.";
  if (!change.aiExplanation.detail.trim()) return "AI explanation detail must not be empty.";
  if (change.aiExplanation.summary.includes("\n")) return "AI explanation summary must stay on one line.";
  if (change.aiExplanation.aiNotes?.some((note) => !note.trim())) return "AI explanation notes must not contain empty items.";
  if (change.action === "create" && change.level === "section" && !change.title.trim()) return "Section title must not be empty.";
  return undefined;
}

/** Finds a stable section index whose generated ID does not collide. */
function findAvailableSectionIndex(sourceFile: StoredSourceFile, title: string, range: { startLine: number; endLine: number }): number {
  const used = new Set(sourceFile.sectionNotes.map((note) => note.id));
  let index = 0;
  const identity = { title, range, summary: "placeholder", detail: "placeholder" };
  while (used.has(createSectionNoteId(identity, index))) index += 1;
  return index;
}

/** Creates one result while retaining the request's identifying fields. */
function createResult(change: AgentNoteChange, action: AgentNoteChangeResult["action"], reason: string, noteId?: string): AgentNoteChangeResult {
  return {
    action,
    noteLevel: change.level,
    ...(noteId || (change.action === "update" && change.noteId) ? { noteId: noteId ?? (change.action === "update" ? change.noteId : undefined) } : {}),
    ...(change.level === "section" && change.action === "create" ? { title: change.title } : {}),
    reason,
  };
}

/** Rejects every requested change when a file-level precondition fails. */
function createRejectedFileResult(request: ApplyAgentNoteUpdatesInput["files"][number], reason: string): AgentNoteUpdateReport["files"][number] {
  return { sourcePath: request.sourcePath, changes: request.changes.map((change) => createResult(change, "failed", reason)) };
}

/** Calculates aggregate report counts from per-file results. */
function summarizeResults(files: AgentNoteUpdateReport["files"]): AgentNoteUpdateReport["summary"] {
  const changes = files.flatMap((file) => file.changes);
  return {
    filesChanged: files.filter((file) => file.changes.some((change) => change.action === "updated" || change.action === "created")).length,
    updated: changes.filter((change) => change.action === "updated").length,
    created: changes.filter((change) => change.action === "created").length,
    skipped: changes.filter((change) => change.action === "skipped").length,
    failed: changes.filter((change) => change.action === "failed").length,
  };
}

/** Normalizes a caller path and rejects absolute or escaping paths. */
function normalizeSourcePath(workspaceRoot: string, requestedPath: string): string | undefined {
  if (!requestedPath.trim() || path.isAbsolute(requestedPath)) return undefined;
  const absolutePath = path.resolve(workspaceRoot, requestedPath);
  if (!isPathInsideDirectory(absolutePath, workspaceRoot) || absolutePath === workspaceRoot) return undefined;
  return path.relative(workspaceRoot, absolutePath).split(path.sep).join("/");
}

/** Returns a stable message for an unknown thrown value. */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Sorts sections by source location and stable ID. */
function compareSections(left: StoredSourceFile["sectionNotes"][number], right: StoredSourceFile["sectionNotes"][number]): number {
  return left.range.startLine - right.range.startLine || left.range.endLine - right.range.endLine || left.id.localeCompare(right.id);
}

/** Sorts line notes by source location and stable ID. */
function compareLines(left: StoredSourceFile["lineNotes"][number], right: StoredSourceFile["lineNotes"][number]): number {
  return left.line - right.line || left.id.localeCompare(right.id);
}
