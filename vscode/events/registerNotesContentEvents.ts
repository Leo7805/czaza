/**
 * Registers VS Code document save events that refresh note status after content changes.
 */

import type { WorkspaceNoteStore } from "@vscode/notes";
import { isRecentInternalWorkspaceNoteWrite } from "@vscode/notes/WorkspaceNoteStoreRepository";
import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";
import {
  applyFileNoteContentChange,
  detectFileNoteContentChange,
} from "@shared/services/notes/fileNoteChangeService";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import { getResourceFingerprint } from "@vscode/services/resourceFingerprint/getResourceFingerprintService";
import { evaluateCzazaResourceAccess } from "@vscode/services/resourceAccess";
import {
  GitAwareSourceChangeGate,
  type GitWorkspaceTransitionGuard,
  type SourceChangeRevisionToken,
} from "@vscode/services/workspaceTransition";
import {
  applySourceRelocationHistoryService,
  applySourceChangeToNotesService,
  classifySourceChangeBatch,
  SourceRelocationHistoryService,
} from "@vscode/services/noteRelocation";
import {
  refreshRuntimeNoteStateService,
  type RuntimeNoteStateRegistry,
} from "@vscode/services/runtimeState";
import * as vscode from "vscode";

const EXTERNAL_CHANGE_DEBOUNCE_MS = 800;
const SAVED_URI_SUPPRESS_MS = 1500;

type PendingDocumentChangeState = {
  hasUnsupportedChange: boolean;
  hasAppliedDeterministicChange: boolean;
};

type DocumentChangeQueue = Map<string, Promise<void>>;

type TextDocumentSnapshot = {
  uri: vscode.Uri;
  languageId?: string;
  getText(): string;
};

/**
 * Registers save handlers for source content freshness detection.
 *
 * @param context - Current VS Code extension context.
 * @param notes - Shared workspace note store.
 * @param notesProvider - Optional notes webview provider to refresh after stored changes.
 * @param workspaceTransitionGuard - Optional Git transition state that suppresses checkout writes.
 * @param runtimeNoteStateRegistry - Optional session registry reconciled after deterministic writes.
 * @param relocationHistoryService - Optional shared in-memory source relocation history.
 * @returns Nothing.
 *
 * @example
 * registerNotesContentEvents(context, notes);
 */
export function registerNotesContentEvents(
  context: vscode.ExtensionContext,
  notes: WorkspaceNoteStore,
  notesProvider?: NotesViewProvider,
  workspaceTransitionGuard?: GitWorkspaceTransitionGuard,
  runtimeNoteStateRegistry?: RuntimeNoteStateRegistry,
  relocationHistoryService?: SourceRelocationHistoryService,
): void {
  const sourceChangeGate = new GitAwareSourceChangeGate(
    EXTERNAL_CHANGE_DEBOUNCE_MS,
    workspaceTransitionGuard,
  );
  const pendingDocumentChanges = new Map<string, PendingDocumentChangeState>();
  const documentChangeQueues: DocumentChangeQueue = new Map();
  const recentlySavedTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const relocationHistory = relocationHistoryService ?? new SourceRelocationHistoryService();
  const watcher = vscode.workspace.createFileSystemWatcher("**/*", true, false, true);
  const transitionDisposable = workspaceTransitionGuard?.onDidStartTransition(() => {
    sourceChangeGate.cancelPending();
    clearTimers(recentlySavedTimers);
    pendingDocumentChanges.clear();
    documentChangeQueues.clear();
    relocationHistory.clearAll();
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      void handleTextDocumentChange(
        notes,
        event,
        notesProvider,
        pendingDocumentChanges,
        documentChangeQueues,
        workspaceTransitionGuard,
        sourceChangeGate,
        runtimeNoteStateRegistry,
        relocationHistory,
      );
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      markRecentlySaved(document.uri, recentlySavedTimers);
      void handleSavedDocument(
        notes,
        document,
        notesProvider,
        pendingDocumentChanges,
        documentChangeQueues,
        workspaceTransitionGuard,
        sourceChangeGate,
        runtimeNoteStateRegistry,
      );
    }),
    watcher.onDidChange((uri) => {
      if (!recentlySavedTimers.has(uri.toString())) {
        relocationHistory.clear(uri.toString());
      }

      scheduleExternalChangeCheck(
        uri,
        notes,
        notesProvider,
        recentlySavedTimers,
        documentChangeQueues,
        workspaceTransitionGuard,
        sourceChangeGate,
        runtimeNoteStateRegistry,
      );
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      relocationHistory.clear(document.uri.toString());
    }),
    watcher,
    ...(transitionDisposable ? [transitionDisposable] : []),
    {
      dispose: () => {
        sourceChangeGate.dispose();
        clearTimers(recentlySavedTimers);
        pendingDocumentChanges.clear();
        documentChangeQueues.clear();
        relocationHistory.clearAll();
      },
    },
  );
}

/**
 * Classifies and queues one VS Code content-change event as an atomic Note update.
 *
 * @param notes - Shared workspace Note store.
 * @param event - VS Code text document change event.
 * @param notesProvider - Optional Notes view refreshed after persistence.
 * @param pendingDocumentChanges - Per-document save fallback state.
 * @param documentChangeQueues - Per-document serialized update queues.
 * @param sourceChangeGate - Git-aware revision gate for automatic persistence.
 * @param runtimeNoteStateRegistry - Optional session registry reconciled after persistence.
 * @param relocationHistory - Session-only reversible relocation history.
 * @returns Promise resolved after the event has been classified and queued.
 */
async function handleTextDocumentChange(
  notes: WorkspaceNoteStore,
  event: vscode.TextDocumentChangeEvent,
  notesProvider: NotesViewProvider | undefined,
  pendingDocumentChanges: Map<string, PendingDocumentChangeState>,
  documentChangeQueues: DocumentChangeQueue,
  workspaceTransitionGuard: GitWorkspaceTransitionGuard | undefined,
  sourceChangeGate: GitAwareSourceChangeGate,
  runtimeNoteStateRegistry: RuntimeNoteStateRegistry | undefined,
  relocationHistory: SourceRelocationHistoryService,
): Promise<void> {
  try {
    if (workspaceTransitionGuard?.isTransitioning()) {
      workspaceTransitionGuard.touchTransition();
      return;
    }

    const editReason = getSourceChangeEditReason(event.reason);

    if (!evaluateCzazaResourceAccess(event.document.uri).allowed) {
      return;
    }

    const key = event.document.uri.toString();
    const document = createTextDocumentSnapshot(event.document);
    const token = sourceChangeGate.captureToken();

    if (event.document.isDirty === false && !editReason) {
      enqueueRuntimeStateRefresh(
        documentChangeQueues,
        key,
        document,
        notes,
        notesProvider,
        runtimeNoteStateRegistry,
        () => sourceChangeGate.canPersist(token),
      );
      return;
    }

    const classifiedBatch = classifySourceChangeBatch({
      contentChanges: event.contentChanges,
    });
    const state = getPendingDocumentChangeState(pendingDocumentChanges, key);

    if (classifiedBatch.kind === "unsupported") {
      state.hasUnsupportedChange = true;
      enqueueRuntimeStateRefresh(
        documentChangeQueues,
        key,
        document,
        notes,
        notesProvider,
        runtimeNoteStateRegistry,
        () => sourceChangeGate.canPersist(token),
      );
      return;
    }

    enqueueDocumentChange(documentChangeQueues, key, async () => {
      if (workspaceTransitionGuard?.isTransitioning()) {
        workspaceTransitionGuard.touchTransition();
        return;
      }

      if (editReason) {
        const historyResult = await applySourceRelocationHistoryService({
          document,
          notes,
          history: relocationHistory,
          direction: editReason,
          now: new Date().toISOString(),
          canPersist: () => sourceChangeGate.canPersist(token),
        });

        if (historyResult.kind === "restored") {
          state.hasAppliedDeterministicChange = true;
          await refreshRuntimeStateAfterDocumentChange(
            document,
            notes,
            runtimeNoteStateRegistry,
            () => sourceChangeGate.canPersist(token),
          );
          await notesProvider?.refreshCurrentNotes(document.uri);
          return;
        }

        if (historyResult.kind === "unavailable" || historyResult.kind === "mismatch") {
          state.hasUnsupportedChange = true;
          await refreshRuntimeStateAfterDocumentChange(
            document,
            notes,
            runtimeNoteStateRegistry,
            () => sourceChangeGate.canPersist(token),
          );
          await notesProvider?.refreshCurrentNotes(document.uri);
        }

        return;
      }

      const result = await applySourceChangeToNotesService({
        document,
        change: classifiedBatch,
        notes,
        now: new Date().toISOString(),
        canPersist: () => sourceChangeGate.canPersist(token),
      });

      if (result.kind !== "updated") {
        return;
      }

      relocationHistory.record(
        document.uri.toString(),
        result.sourceFile,
        result.updatedSourceFile,
      );
      state.hasAppliedDeterministicChange = true;
      await refreshRuntimeStateAfterDocumentChange(
        document,
        notes,
        runtimeNoteStateRegistry,
        () => sourceChangeGate.canPersist(token),
      );
      await notesProvider?.refreshCurrentNotes(document.uri);
    });
  } catch (error) {
    console.error("Failed to apply deterministic CZaza note updates after a text change.", error);
  }
}

/**
 * Maps VS Code history reasons to the source relocation contract.
 *
 * @param reason - Optional VS Code text document change reason.
 * @returns Undo, redo, or undefined for an ordinary edit.
 */
function getSourceChangeEditReason(
  reason: vscode.TextDocumentChangeReason | undefined,
): "undo" | "redo" | undefined {
  if (reason === vscode.TextDocumentChangeReason.Undo) {
    return "undo";
  }

  if (reason === vscode.TextDocumentChangeReason.Redo) {
    return "redo";
  }

  return undefined;
}

/**
 * Re-detects one changed resource and reconciles its session-only Runtime State.
 *
 * Runtime reconciliation is best-effort because a transient read failure must not
 * invalidate an already persisted deterministic relocation or modify persistent Notes.
 *
 * @param document - Immutable post-change source snapshot.
 * @param notes - Shared persistent Note Store reader.
 * @param registry - Optional session-only Runtime Note State Registry.
 * @param canApply - Final revision check for the asynchronous registry mutation.
 * @returns Whether the Runtime Note State Registry changed.
 */
async function refreshRuntimeStateAfterDocumentChange(
  document: TextDocumentSnapshot,
  notes: WorkspaceNoteStore,
  registry: RuntimeNoteStateRegistry | undefined,
  canApply: () => boolean,
): Promise<boolean> {
  if (!registry) {
    return false;
  }

  try {
    const result = await refreshRuntimeNoteStateService({
      document,
      notes,
      registry,
      now: new Date().toISOString(),
      canApply,
    });
    return result.registryChange !== "none";
  } catch (error) {
    console.error(
      "Failed to refresh CZaza Runtime Note State after a document change.",
      error,
    );
    return false;
  }
}

/**
 * Serializes a read-only Runtime State refresh with other changes for the same document.
 *
 * @param documentChangeQueues - Per-document serialized update queues.
 * @param key - Stable document URI key.
 * @param document - Immutable post-change source snapshot.
 * @param notes - Shared persistent Note Store reader.
 * @param notesProvider - Optional Notes view refreshed after Runtime State changes.
 * @param registry - Optional session-only Runtime Note State Registry.
 * @param canApply - Final revision check for the asynchronous registry mutation.
 * @returns Nothing.
 */
function enqueueRuntimeStateRefresh(
  documentChangeQueues: DocumentChangeQueue,
  key: string,
  document: TextDocumentSnapshot,
  notes: WorkspaceNoteStore,
  notesProvider: NotesViewProvider | undefined,
  registry: RuntimeNoteStateRegistry | undefined,
  canApply: () => boolean,
): void {
  enqueueDocumentChange(documentChangeQueues, key, async () => {
    const changed = await refreshRuntimeStateAfterDocumentChange(
      document,
      notes,
      registry,
      canApply,
    );
    if (changed) {
      await notesProvider?.refreshCurrentNotes(document.uri);
    }
  });
}

/**
 * Refreshes session-only Runtime State after a save without mutating persistent Notes.
 *
 * @param notes - Shared workspace Note store.
 * @param document - Saved VS Code document.
 * @param notesProvider - Optional Notes view refreshed after persistence.
 * @param pendingDocumentChanges - Per-document save fallback state.
 * @param documentChangeQueues - Per-document serialized update queues.
 * @param workspaceTransitionGuard - Optional Git transition state.
 * @param sourceChangeGate - Git-aware revision gate for automatic persistence.
 * @param runtimeNoteStateRegistry - Optional session registry receiving read-only detection.
 * @returns Promise resolved after save-time detection or suppression.
 */
async function handleSavedDocument(
  notes: WorkspaceNoteStore,
  document: vscode.TextDocument,
  notesProvider: NotesViewProvider | undefined,
  pendingDocumentChanges: Map<string, PendingDocumentChangeState>,
  documentChangeQueues: DocumentChangeQueue,
  workspaceTransitionGuard: GitWorkspaceTransitionGuard | undefined,
  sourceChangeGate: GitAwareSourceChangeGate,
  runtimeNoteStateRegistry: RuntimeNoteStateRegistry | undefined,
): Promise<void> {
  if (workspaceTransitionGuard?.isTransitioning()) {
    workspaceTransitionGuard.touchTransition();
    return;
  }

  if (!evaluateCzazaResourceAccess(document.uri).allowed) {
    return;
  }

  const key = document.uri.toString();
  const token = sourceChangeGate.captureToken();
  const queuedChanges = documentChangeQueues.get(key);

  if (queuedChanges) {
    await queuedChanges;
  }

  if (!sourceChangeGate.canPersist(token)) {
    return;
  }

  const state = pendingDocumentChanges.get(key);

  pendingDocumentChanges.delete(key);

  if (state?.hasAppliedDeterministicChange && !state.hasUnsupportedChange) {
    return;
  }

  const changed = await refreshRuntimeStateAfterDocumentChange(
    createTextDocumentSnapshot(document),
    notes,
    runtimeNoteStateRegistry,
    () => sourceChangeGate.canPersist(token),
  );
  if (changed) {
    await notesProvider?.refreshCurrentNotes(document.uri);
  }
}

function getPendingDocumentChangeState(
  pendingDocumentChanges: Map<string, PendingDocumentChangeState>,
  key: string,
): PendingDocumentChangeState {
  const existing = pendingDocumentChanges.get(key);

  if (existing) {
    return existing;
  }

  const next = {
    hasUnsupportedChange: false,
    hasAppliedDeterministicChange: false,
  };

  pendingDocumentChanges.set(key, next);

  return next;
}

function enqueueDocumentChange(
  documentChangeQueues: DocumentChangeQueue,
  key: string,
  task: () => Promise<void>,
): void {
  const previous = documentChangeQueues.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(task)
    .catch((error) => {
      console.error("Failed to apply queued CZaza note updates after a text change.", error);
    });
  const tracked = next.finally(() => {
    if (documentChangeQueues.get(key) === tracked) {
      documentChangeQueues.delete(key);
    }
  });

  documentChangeQueues.set(key, tracked);
}

function createTextDocumentSnapshot(document: vscode.TextDocument): TextDocumentSnapshot {
  const text = document.getText();

  return {
    uri: document.uri,
    languageId: document.languageId,
    getText: () => text,
  };
}

/**
 * Schedules external source inspection unless a Git transition is active.
 *
 * @param uri - Changed workspace resource URI.
 * @param notes - Shared workspace Note store.
 * @param notesProvider - Optional Notes view refreshed after persistence.
 * @param recentlySavedTimers - Recently saved resources suppressed from rechecking.
 * @param documentChangeQueues - Per-document queue shared with VS Code document events.
 * @param workspaceTransitionGuard - Optional Git transition state.
 * @param sourceChangeGate - Git-aware debounce and revision gate.
 * @param runtimeNoteStateRegistry - Optional session registry receiving text-file detection.
 * @returns Nothing.
 */
function scheduleExternalChangeCheck(
  uri: vscode.Uri,
  notes: WorkspaceNoteStore,
  notesProvider: NotesViewProvider | undefined,
  recentlySavedTimers: Map<string, ReturnType<typeof setTimeout>>,
  documentChangeQueues: DocumentChangeQueue,
  workspaceTransitionGuard: GitWorkspaceTransitionGuard | undefined,
  sourceChangeGate: GitAwareSourceChangeGate,
  runtimeNoteStateRegistry: RuntimeNoteStateRegistry | undefined,
): void {
  const access = evaluateCzazaResourceAccess(uri);

  if (!access.allowed && access.reason === "noteStore") {
    if (!isRecentInternalWorkspaceNoteWrite(uri.fsPath)) {
      invalidateManagedNoteStore(uri, notes, sourceChangeGate);
    }
    return;
  }

  if (!access.allowed) {
    return;
  }

  if (workspaceTransitionGuard?.isTransitioning()) {
    workspaceTransitionGuard.touchTransition();
    return;
  }

  if (uri.scheme !== "file" || recentlySavedTimers.has(uri.toString())) {
    return;
  }

  const key = uri.toString();
  sourceChangeGate.schedule(key, (token) =>
    handleExternalChange(
      notes,
      uri,
      notesProvider,
      documentChangeQueues,
      workspaceTransitionGuard,
      sourceChangeGate,
      token,
      runtimeNoteStateRegistry,
    ),
  );
}

/**
 * Clears cached Notes and invalidates automatic tasks after Note Store changes externally.
 *
 * @param uri - Changed CZaza-managed Note Store resource.
 * @param notes - Shared workspace Note store.
 * @param sourceChangeGate - Automatic task gate to invalidate.
 * @returns Nothing.
 */
function invalidateManagedNoteStore(
  uri: vscode.Uri,
  notes: WorkspaceNoteStore,
  sourceChangeGate: GitAwareSourceChangeGate,
): void {
  try {
    const { rootDirectory } = resolveCzazaRootDirectory(uri);
    const settings = getCzazaSettings(uri);

    sourceChangeGate.invalidate();
    notes.cache.clearCache(rootDirectory, settings.outputDirectory);
  } catch {
    // Out-of-scope Note Store events require no cache invalidation.
  }
}

/**
 * Applies one external resource change unless Git is replacing workspace files.
 *
 * @param notes - Shared workspace Note store.
 * @param uri - Changed workspace resource URI.
 * @param notesProvider - Optional Notes view refreshed after persistence.
 * @param documentChangeQueues - Per-document queue shared with VS Code document events.
 * @param workspaceTransitionGuard - Optional Git transition state.
 * @param sourceChangeGate - Git-aware revision gate.
 * @param token - Revision captured when the delayed task was scheduled.
 * @param runtimeNoteStateRegistry - Optional session registry receiving text-file detection.
 * @returns Promise resolved after inspection or suppression.
 */
async function handleExternalChange(
  notes: WorkspaceNoteStore,
  uri: vscode.Uri,
  notesProvider: NotesViewProvider | undefined,
  documentChangeQueues: DocumentChangeQueue,
  workspaceTransitionGuard: GitWorkspaceTransitionGuard | undefined,
  sourceChangeGate: GitAwareSourceChangeGate,
  token: SourceChangeRevisionToken,
  runtimeNoteStateRegistry: RuntimeNoteStateRegistry | undefined,
): Promise<void> {
  try {
    if (workspaceTransitionGuard?.isTransitioning()) {
      workspaceTransitionGuard.touchTransition();
      return;
    }

    const fingerprint = await getResourceFingerprint(uri);

    if (fingerprint.kind === "text") {
      enqueueRuntimeStateRefresh(
        documentChangeQueues,
        uri.toString(),
        createTextDocumentSnapshot(fingerprint.document),
        notes,
        notesProvider,
        runtimeNoteStateRegistry,
        () => sourceChangeGate.canPersist(token),
      );
      return;
    }

    if (fingerprint.kind === "binary") {
      const { rootDirectory } = resolveCzazaRootDirectory(uri);
      const settings = getCzazaSettings(uri);
      const relativePath = getCzazaRelativePath(uri, rootDirectory);
      const sourceFile = await notes.cache.getSourceFile(
        rootDirectory,
        settings.outputDirectory,
        relativePath,
      );

      if (!sourceFile) {
        return;
      }

      const detection = detectFileNoteContentChange({
        previousSourceHash: sourceFile.source.sourceHash,
        nextSourceHash: fingerprint.hash,
      });
      const result = applyFileNoteContentChange({
        sourceFile,
        detection,
        now: new Date().toISOString(),
      });

      if (result.changed) {
        const updatedSourceFile = {
          ...result.sourceFile,
          source: { ...result.sourceFile.source, sourceHashKind: "metadata" as const },
        };

        if (!sourceChangeGate.canPersist(token)) {
          return;
        }

        await notes.cache.saveSourceFile(
          rootDirectory,
          settings.outputDirectory,
          relativePath,
          updatedSourceFile,
          new Date().toISOString(),
          { canPersist: () => sourceChangeGate.canPersist(token) },
        );
        await notesProvider?.refreshCurrentNotes(uri);
      }
    }
  } catch (error) {
    console.error("Failed to inspect externally changed CZaza resource.", error);
  }
}

function markRecentlySaved(
  uri: vscode.Uri,
  recentlySavedTimers: Map<string, ReturnType<typeof setTimeout>>,
): void {
  const key = uri.toString();
  const previousTimer = recentlySavedTimers.get(key);

  if (previousTimer) {
    clearTimeout(previousTimer);
  }

  recentlySavedTimers.set(
    key,
    setTimeout(() => {
      recentlySavedTimers.delete(key);
    }, SAVED_URI_SUPPRESS_MS),
  );
}

function clearTimers(timers: Map<string, ReturnType<typeof setTimeout>>): void {
  for (const timer of timers.values()) {
    clearTimeout(timer);
  }

  timers.clear();
}
