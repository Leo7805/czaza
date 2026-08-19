/**
 * Restores hash-validated source relocation history through the workspace Note Store.
 */

import { createSourceHash } from "@shared/utils/hashUtils";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import type { ScopedWorkspaceNoteStore } from "@vscode/notes";
import type * as vscode from "vscode";
import { SourceRelocationHistoryService } from "./SourceRelocationHistoryService";

/** Input for restoring one VS Code Undo or Redo relocation. */
export type ApplySourceRelocationHistoryInput = {
  document: {
    uri: vscode.Uri;
    getText(): string;
  };
  notes: ScopedWorkspaceNoteStore;
  history: SourceRelocationHistoryService;
  direction: "undo" | "redo";
  now: string;
  canPersist?: () => boolean;
};

/** Result of attempting one source relocation history restoration. */
export type ApplySourceRelocationHistoryResult =
  | { kind: "restored"; relativePath: string }
  | { kind: "unavailable" | "mismatch"; relativePath: string }
  | { kind: "untracked" | "cancelled"; relativePath: string }
  | { kind: "ignored" };

/**
 * Restores relocation-owned fields for a matching source Undo or Redo event.
 *
 * @param input - Current document, Note Store, history, direction, and persistence gate.
 * @returns Restoration outcome without modifying user-authored Note content.
 */
export async function applySourceRelocationHistoryService(
  input: ApplySourceRelocationHistoryInput,
): Promise<ApplySourceRelocationHistoryResult> {
  if (input.document.uri.scheme !== "file") {
    return { kind: "ignored" };
  }

  const resolvedRoot = resolveCzazaRootDirectory(input.document.uri);
  const settings = getCzazaSettings(input.document.uri);
  const relativePath = getCzazaRelativePath(
    input.document.uri,
    resolvedRoot.rootDirectory,
  );
  const sourceFile = await input.notes.cache.getSourceFile(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    relativePath,
  );

  if (!sourceFile) {
    return { kind: "untracked", relativePath };
  }

  const resourceKey = input.document.uri.toString();
  const documentSourceHash = createSourceHash(input.document.getText());
  const prepared =
    input.direction === "undo"
      ? input.history.prepareUndo(resourceKey, sourceFile, documentSourceHash)
      : input.history.prepareRedo(resourceKey, sourceFile, documentSourceHash);

  if (prepared.kind !== "ready") {
    return { kind: prepared.kind, relativePath };
  }

  const canPersist = input.canPersist ?? (() => true);

  if (!canPersist()) {
    return { kind: "cancelled", relativePath };
  }

  await input.notes.cache.saveSourceFile(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    relativePath,
    prepared.sourceFile,
    input.now,
    { canPersist },
  );

  const committed =
    input.direction === "undo"
      ? input.history.commitUndo(resourceKey, prepared.entryId)
      : input.history.commitRedo(resourceKey, prepared.entryId);

  if (!committed) {
    input.history.clear(resourceKey);
    return { kind: "mismatch", relativePath };
  }

  return { kind: "restored", relativePath };
}
