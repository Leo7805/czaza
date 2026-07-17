/**
 * Clears stale note status from the notes webview.
 */

import type { NoteStatus } from "@shared/models/domain/common";
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

  switch (target.level) {
    case "file": {
      const status = getClearedStatus(sourceFile.fileNote?.status);

      if (!status) {
        return false;
      }

      await input.notes.update.updateFileNoteStatus(
        resolvedRoot.rootDirectory,
        settings.outputDirectory,
        relativePath,
        status,
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

      await input.notes.update.updateSectionNoteStatus(
        resolvedRoot.rootDirectory,
        settings.outputDirectory,
        relativePath,
        section.id,
        status,
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

      await input.notes.update.updateLineNoteStatus(
        resolvedRoot.rootDirectory,
        settings.outputDirectory,
        relativePath,
        line.id,
        status,
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
    ...status,
    content: "current",
  };
}
