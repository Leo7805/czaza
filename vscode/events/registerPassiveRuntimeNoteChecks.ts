/**
 * Registers on-demand consistency checks for opened and active source documents.
 */

import { createSourceHash } from "@shared/utils/hashUtils";
import { TEAM_NOTE_STORE, type WorkspaceNoteStore } from "@vscode/notes";
import type { PersonalNoteScopeService } from "@vscode/personalNotes";
import { evaluateCzazaResourceAccess } from "@vscode/services/resourceAccess";
import {
  passiveRuntimeNoteCheckService,
  type RuntimeNoteDetectionDocument,
  type RuntimeNoteStateRegistry,
} from "@vscode/services/runtimeState";
import * as vscode from "vscode";

/** Immutable document snapshot used by an asynchronous passive check. */
type PassiveDocumentSnapshot = RuntimeNoteDetectionDocument & {
  sourceHash: string;
};

/**
 * Registers passive checks without scanning the whole workspace.
 *
 * Open and active-editor events are deduplicated by resource and source hash.
 * A later snapshot invalidates any older asynchronous result for that resource.
 *
 * @param context - Current VS Code extension context.
 * @param notes - Shared persistent Note Store reader.
 * @param registry - Shared session-only Runtime Note State Registry.
 * @returns Nothing.
 *
 * @example
 * registerPassiveRuntimeNoteChecks(context, notes, registry);
 */
export function registerPassiveRuntimeNoteChecks(
  context: vscode.ExtensionContext,
  notes: WorkspaceNoteStore,
  registry: RuntimeNoteStateRegistry,
  noteScope?: PersonalNoteScopeService,
): void {
  const observedHashes = new Map<string, string>();
  const generations = new Map<string, number>();
  const queues = new Map<string, Promise<void>>();
  let disposed = false;

  /**
   * Schedules the latest unique snapshot for one opened source document.
   *
   * @param document - Opened or active VS Code document.
   * @returns Nothing.
   */
  const scheduleCheck = (document: vscode.TextDocument | undefined): void => {
    if (!document || document.uri.scheme !== "file" || disposed) {
      return;
    }

    const snapshot = createDocumentSnapshot(document);
    const key = snapshot.uri.toString();

    if (observedHashes.get(key) === snapshot.sourceHash) {
      return;
    }

    observedHashes.set(key, snapshot.sourceHash);
    const generation = (generations.get(key) ?? 0) + 1;
    generations.set(key, generation);
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        if (disposed || generations.get(key) !== generation) {
          return;
        }

        const access = evaluateCzazaResourceAccess(snapshot.uri);

        if (!access.allowed) {
          return;
        }

        const location = noteScope
          ? await noteScope.resolveLocation(
              access.root.rootDirectory,
              access.settings.outputDirectory,
            )
          : TEAM_NOTE_STORE;
        await passiveRuntimeNoteCheckService({
          document: snapshot,
          notes: notes.scope(
            access.root.rootDirectory,
            access.settings.outputDirectory,
            location,
          ),
          registry,
          now: new Date().toISOString(),
          canApply: () =>
            !disposed &&
            generations.get(key) === generation &&
            observedHashes.get(key) === snapshot.sourceHash,
        });
      })
      .catch((error: unknown) => {
        if (generations.get(key) === generation) {
          observedHashes.delete(key);
        }

        console.error("Failed to passively check CZaza Runtime Note State.", error);
      })
      .finally(() => {
        if (queues.get(key) === next) {
          queues.delete(key);
        }
      });

    queues.set(key, next);
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(scheduleCheck),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      scheduleCheck(editor?.document);
    }),
    {
      dispose: () => {
        disposed = true;
        observedHashes.clear();
        generations.clear();
        queues.clear();
      },
    },
  );

  scheduleCheck(vscode.window.activeTextEditor?.document);
}

/**
 * Captures immutable source text before an asynchronous passive check starts.
 *
 * @param document - Current VS Code document.
 * @returns Document snapshot and its source hash.
 */
function createDocumentSnapshot(
  document: vscode.TextDocument,
): PassiveDocumentSnapshot {
  const text = document.getText();

  return {
    uri: document.uri,
    languageId: document.languageId,
    sourceHash: createSourceHash(text),
    getText: () => text,
  };
}
