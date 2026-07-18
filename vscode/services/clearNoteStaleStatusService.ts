/**
 * Clears stale note status from the notes webview.
 */

import type { NoteStatus } from "@shared/models/domain/common";
import {
  updateLineAnchorText,
  updateProgrammingLanguage,
  updateSectionAnchorHash,
  updateSourceHash,
} from "@shared/services/notes/noteAnchorService";
import {
  updateFileNoteStatus,
  updateLineNoteStatus,
  updateSectionNoteStatus,
} from "@shared/services/notes/noteStatusService";
import { createSourceHash } from "@shared/utils/hashUtils";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";
import type { UserNoteTarget } from "./saveUserNoteService";
import * as vscode from "vscode";

/** Input for clearing stale status on one note. */
export type ClearNoteStaleStatusInput = {
  /** Source resource that owns the note. */
  uri: vscode.Uri;

  /** Shared workspace note store. */
  notes: WorkspaceNoteStore;

  /** File, section, or line note target selected in the webview. */
  target: UserNoteTarget;
};

/**
 * Marks one stale note as content-current while preserving its anchor status.
 *
 * @param input - Resource URI, note store, and target note.
 * @returns True when a stored note was updated.
 */
export async function clearNoteStaleStatusService(input: ClearNoteStaleStatusInput): Promise<boolean> {
  const resolvedRoot = resolveCzazaRootDirectory(input.uri);
  const settings = getCzazaSettings(input.uri);
  const relativePath = getCzazaRelativePath(input.uri, resolvedRoot.rootDirectory);
  const sourceFile = await input.notes.cache.getSourceFile(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    relativePath,
  );

  if (!sourceFile) {
    return false;
  }

  const now = new Date().toISOString();
  const target = input.target;
  const document = await openTextDocument(input.uri);
  const lines = document ? splitSourceLines(document.getText()) : [];
  let next = document
    ? updateProgrammingLanguage(
        updateSourceHash(sourceFile, createSourceHash(document.getText())),
        document.languageId,
      )
    : sourceFile;

  switch (target.level) {
    case "file": {
      const status = getClearedStatus(sourceFile.fileNote?.status);

      if (!status) {
        return false;
      }

      next = updateFileNoteStatus(next, status, now);

      await input.notes.cache.saveSourceFile(
        resolvedRoot.rootDirectory,
        settings.outputDirectory,
        relativePath,
        next,
        now,
      );
      return true;
    }

    case "section": {
      const section = sourceFile.sectionNotes.find((note) => note.id === target.sectionId);
      const status = getClearedStatus(section?.status);

      if (!section || !status) {
        return false;
      }

      if (!isValidRange(section.range.startLine, section.range.endLine, lines.length)) {
        return false;
      }

      next = updateSectionAnchorHash(
        updateSectionNoteStatus(next, section.id, status, now),
        section.id,
        createSourceHash(getRangeText(lines, section.range.startLine, section.range.endLine)),
        now,
      );

      await input.notes.cache.saveSourceFile(
        resolvedRoot.rootDirectory,
        settings.outputDirectory,
        relativePath,
        next,
        now,
      );
      return true;
    }

    case "line": {
      const line = sourceFile.lineNotes.find((note) => note.line === target.line);
      const status = getClearedStatus(line?.status);

      if (!line || !status) {
        return false;
      }

      if (!isValidLine(line.line, lines.length)) {
        return false;
      }

      next = updateLineAnchorText(
        updateLineNoteStatus(next, line.id, status, now),
        line.id,
        lines[line.line - 1] ?? "",
        now,
      );

      await input.notes.cache.saveSourceFile(
        resolvedRoot.rootDirectory,
        settings.outputDirectory,
        relativePath,
        next,
        now,
      );
      return true;
    }
  }
}

function getClearedStatus(status: NoteStatus | undefined): NoteStatus | undefined {
  if (!status || status.content !== "stale") {
    return undefined;
  }

  return {
    content: "current",
    anchor: "confirmed",
  };
}

async function openTextDocument(uri: vscode.Uri): Promise<vscode.TextDocument | undefined> {
  try {
    return await vscode.workspace.openTextDocument(uri);
  } catch {
    return undefined;
  }
}

function splitSourceLines(sourceText: string): string[] {
  return sourceText.split(/\r\n|\r|\n/);
}

function getRangeText(lines: string[], startLine: number, endLine: number): string {
  return lines.slice(startLine - 1, endLine).join("\n");
}

function isValidRange(startLine: number, endLine: number, lineCount: number): boolean {
  return (
    Number.isInteger(startLine) &&
    Number.isInteger(endLine) &&
    startLine >= 1 &&
    endLine >= startLine &&
    endLine <= lineCount
  );
}

function isValidLine(line: number, lineCount: number): boolean {
  return Number.isInteger(line) && line >= 1 && line <= lineCount;
}
