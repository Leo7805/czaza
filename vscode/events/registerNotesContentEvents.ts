/**
 * Registers VS Code document save events that refresh note status after content changes.
 */

import {
  TEAM_NOTE_STORE,
  type ScopedWorkspaceNoteStore,
  type WorkspaceNoteStore,
} from "@vscode/notes";
import { isRecentInternalWorkspaceNoteWrite } from "@vscode/notes/WorkspaceNoteStoreRepository";
import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";
import type { PersonalNoteScopeService } from "@vscode/personalNotes";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import { resolveCzazaRootDirectory } from "@vscode/config/resolveCzazaRootDirectory";
import { getResourceFingerprint } from "@vscode/services/resourceFingerprint/getResourceFingerprintService";
import { evaluateCzazaResourceAccess } from "@vscode/services/resourceAccess";
import {
  ChangeTaskCoordinator,
  type ChangeTaskToken,
} from "@vscode/services/changeCoordination";
import {
  applySourceRelocationHistoryService,
  applySourceChangeToNotesService,
  classifySourceChangeBatch,
  SourceRelocationHistoryService,
} from "@vscode/services/noteRelocation";
import {
  refreshBinaryRuntimeNoteStateService,
  refreshMissingRuntimeNoteStateService,
  RuntimeNoteStateDetectionController,
  type RuntimeNoteStateRegistry,
} from "@vscode/services/runtimeState";
import * as vscode from "vscode";

const EXTERNAL_CHANGE_DEBOUNCE_MS = 800;
const SAVED_URI_SUPPRESS_MS = 1500;

type PendingDocumentChangeState = {
  hasUnsupportedChange: boolean;
  hasAppliedDeterministicChange: boolean;
};

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
 * @param runtimeNoteStateRegistry - Optional session registry reconciled after deterministic writes.
 * @param relocationHistoryService - Optional shared in-memory source relocation history.
 * @param changeCoordinator - Optional shared source and resource task coordinator.
 * @returns Nothing.
 *
 * @example
 * registerNotesContentEvents(context, notes);
 */
export function registerNotesContentEvents(
  context: vscode.ExtensionContext,
  notes: WorkspaceNoteStore,
  notesProvider?: NotesViewProvider,
  runtimeNoteStateRegistry?: RuntimeNoteStateRegistry,
  relocationHistoryService?: SourceRelocationHistoryService,
  changeCoordinator?: ChangeTaskCoordinator,
  noteScope?: PersonalNoteScopeService,
): void {
  const taskCoordinator =
    changeCoordinator ?? new ChangeTaskCoordinator(EXTERNAL_CHANGE_DEBOUNCE_MS);
  const ownsTaskCoordinator = !changeCoordinator;
  const pendingDocumentChanges = new Map<string, PendingDocumentChangeState>();
  const recentlySavedTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const relocationHistory = relocationHistoryService ?? new SourceRelocationHistoryService();
  const watcher = vscode.workspace.createFileSystemWatcher("**/*", true, false, false);

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      void handleTextDocumentChange(
        notes,
        event,
        notesProvider,
        pendingDocumentChanges,
        taskCoordinator,
        runtimeNoteStateRegistry,
        relocationHistory,
        noteScope,
      );
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      markRecentlySaved(document.uri, recentlySavedTimers);
      void handleSavedDocument(
        notes,
        document,
        notesProvider,
        pendingDocumentChanges,
        taskCoordinator,
        runtimeNoteStateRegistry,
        noteScope,
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
        taskCoordinator,
        runtimeNoteStateRegistry,
        noteScope,
      );
    }),
    watcher.onDidCreate((uri) => {
      scheduleExternalChangeCheck(
        uri,
        notes,
        notesProvider,
        recentlySavedTimers,
        taskCoordinator,
        runtimeNoteStateRegistry,
        noteScope,
      );
    }),
    watcher.onDidDelete((uri) => {
      scheduleExternalDeleteCheck(
        uri,
        notes,
        notesProvider,
        taskCoordinator,
        runtimeNoteStateRegistry,
        noteScope,
      );
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      relocationHistory.clear(document.uri.toString());
    }),
    watcher,
    {
      dispose: () => {
        if (ownsTaskCoordinator) {
          taskCoordinator.dispose();
        }
        clearTimers(recentlySavedTimers);
        pendingDocumentChanges.clear();
        relocationHistory.clearAll();
      },
    },
  );
}

/**
 * Schedules a missing-resource check after deterministic Delete events can register suppression.
 *
 * @param uri - Resource reported deleted by the filesystem watcher.
 * @param notes - Shared workspace Note Store.
 * @param notesProvider - Optional Notes view refreshed after external Store replacement.
 * @param taskCoordinator - Shared debounce, queue, suppression, and invalidation owner.
 * @param runtimeNoteStateRegistry - Optional session-only Runtime State registry.
 * @returns Nothing.
 */
function scheduleExternalDeleteCheck(
  uri: vscode.Uri,
  notes: WorkspaceNoteStore,
  notesProvider: NotesViewProvider | undefined,
  taskCoordinator: ChangeTaskCoordinator,
  runtimeNoteStateRegistry: RuntimeNoteStateRegistry | undefined,
  noteScope: PersonalNoteScopeService | undefined,
): void {
  const access = evaluateCzazaResourceAccess(uri);

  if (!access.allowed && access.reason === "noteStore") {
    if (!isRecentInternalWorkspaceNoteWrite(uri.fsPath)) {
      invalidateManagedNoteStore(uri, notes, notesProvider, taskCoordinator);
    }
    return;
  }

  if (!access.allowed) {
    return;
  }

  const key = `delete:${uri.toString()}`;
  taskCoordinator.schedule(key, (token) => {
    if (
      taskCoordinator.isDeleteSuppressed(uri) ||
      !taskCoordinator.canApply(token) ||
      !runtimeNoteStateRegistry
    ) {
      return;
    }

    taskCoordinator.enqueue(uri.toString(), async () => {
      if (await doesWorkspaceResourceExist(uri)) {
        await handleExternalChange(
          notes,
          uri,
          undefined,
          taskCoordinator,
          token,
          runtimeNoteStateRegistry,
          noteScope,
        );
        return;
      }

      const scopedNotes = await resolveScopedNotes(uri, notes, noteScope);

      if (!scopedNotes) {
        return;
      }

      await refreshMissingRuntimeNoteStateService({
        uri,
        notes: scopedNotes,
        registry: runtimeNoteStateRegistry,
        now: new Date().toISOString(),
      });
    });
  });
}

/**
 * Checks whether a Watcher Delete target has reappeared before marking it missing.
 *
 * @param uri - Workspace resource that produced the Delete event.
 * @returns True when the resource currently exists.
 */
async function doesWorkspaceResourceExist(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "FileNotFound" || error.code === "ENOENT")
    ) {
      return false;
    }

    throw error;
  }
}

/**
 * Classifies and queues one VS Code content-change event as an atomic Note update.
 *
 * @param notes - Shared workspace Note store.
 * @param event - VS Code text document change event.
 * @param notesProvider - Optional Notes view refreshed after persistence.
 * @param pendingDocumentChanges - Per-document save fallback state.
 * @param taskCoordinator - Shared per-resource queue and task validity owner.
 * @param runtimeNoteStateRegistry - Optional session registry reconciled after persistence.
 * @param relocationHistory - Session-only reversible relocation history.
 * @returns Promise resolved after the event has been classified and queued.
 */
async function handleTextDocumentChange(
  notes: WorkspaceNoteStore,
  event: vscode.TextDocumentChangeEvent,
  notesProvider: NotesViewProvider | undefined,
  pendingDocumentChanges: Map<string, PendingDocumentChangeState>,
  taskCoordinator: ChangeTaskCoordinator,
  runtimeNoteStateRegistry: RuntimeNoteStateRegistry | undefined,
  relocationHistory: SourceRelocationHistoryService,
  noteScope: PersonalNoteScopeService | undefined,
): Promise<void> {
  const editReason = getSourceChangeEditReason(event.reason);

  const key = event.document.uri.toString();
  const document = createTextDocumentSnapshot(event.document);
  const token = taskCoordinator.captureToken();
  const access = evaluateCzazaResourceAccess(event.document.uri);

  if (!access.allowed) {
    return;
  }

  const classifiedBatch = classifySourceChangeBatch({
    contentChanges: event.contentChanges,
  });
  const state = getPendingDocumentChangeState(pendingDocumentChanges, key);
  const isDirty = event.document.isDirty;

  taskCoordinator.enqueue(key, async () => {
    try {
      const location = noteScope
        ? await noteScope.resolveLocation(
            access.root.rootDirectory,
            access.settings.outputDirectory,
          )
        : TEAM_NOTE_STORE;
      const scopedNotes = notes.scope(
        access.root.rootDirectory,
        access.settings.outputDirectory,
        location,
      );

      if (isDirty === false && !editReason) {
        await refreshRuntimeState(
          document,
          scopedNotes,
          notesProvider,
          runtimeNoteStateRegistry,
          () => taskCoordinator.canApply(token),
        );
        return;
      }

      if (classifiedBatch.kind === "unsupported") {
        state.hasUnsupportedChange = true;
        await refreshRuntimeState(
          document,
          scopedNotes,
          notesProvider,
          runtimeNoteStateRegistry,
          () => taskCoordinator.canApply(token),
        );
        return;
      }

      if (editReason) {
        const historyResult = await applySourceRelocationHistoryService({
          document,
          notes: scopedNotes,
          history: relocationHistory,
          direction: editReason,
          now: new Date().toISOString(),
          canPersist: () => taskCoordinator.canApply(token),
        });

        if (historyResult.kind === "restored") {
          state.hasAppliedDeterministicChange = true;
          await refreshRuntimeStateAfterDocumentChange(
            document,
            scopedNotes,
            runtimeNoteStateRegistry,
            () => taskCoordinator.canApply(token),
          );
          await notesProvider?.refreshCurrentNotes(document.uri);
          return;
        }

        if (historyResult.kind === "unavailable" || historyResult.kind === "mismatch") {
          state.hasUnsupportedChange = true;
          await refreshRuntimeStateAfterDocumentChange(
            document,
            scopedNotes,
            runtimeNoteStateRegistry,
            () => taskCoordinator.canApply(token),
          );
          await notesProvider?.refreshCurrentNotes(document.uri);
        }

        return;
      }

      const result = await applySourceChangeToNotesService({
        document,
        change: classifiedBatch,
        notes: scopedNotes,
        now: new Date().toISOString(),
        canPersist: () => taskCoordinator.canApply(token),
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
        scopedNotes,
        runtimeNoteStateRegistry,
        () => taskCoordinator.canApply(token),
      );
      await notesProvider?.refreshCurrentNotes(document.uri);
    } catch (error) {
      console.error("Failed to apply deterministic CZaza note updates after a text change.", error);
    }
  });
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
  notes: ScopedWorkspaceNoteStore,
  registry: RuntimeNoteStateRegistry | undefined,
  canApply: () => boolean,
): Promise<boolean> {
  if (!registry) {
    return false;
  }

  try {
    const result = await new RuntimeNoteStateDetectionController(
      notes,
      registry,
    ).detectCurrentFileNotes(document, canApply);
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
 * @param taskCoordinator - Shared per-resource queue owner.
 * @param key - Stable document URI key.
 * @param document - Immutable post-change source snapshot.
 * @param notes - Shared persistent Note Store reader.
 * @param notesProvider - Optional Notes view refreshed after Runtime State changes.
 * @param registry - Optional session-only Runtime Note State Registry.
 * @param canApply - Final revision check for the asynchronous registry mutation.
 * @returns Nothing.
 */
function enqueueRuntimeStateRefresh(
  taskCoordinator: ChangeTaskCoordinator,
  key: string,
  document: TextDocumentSnapshot,
  notes: ScopedWorkspaceNoteStore,
  notesProvider: NotesViewProvider | undefined,
  registry: RuntimeNoteStateRegistry | undefined,
  canApply: () => boolean,
): void {
  taskCoordinator.enqueue(key, () =>
    refreshRuntimeState(document, notes, notesProvider, registry, canApply),
  );
}

/**
 * Re-detects one changed resource and refreshes its Runtime State and Notes view.
 *
 * @param document - Immutable post-change source snapshot.
 * @param notes - Shared persistent Note Store reader.
 * @param notesProvider - Optional Notes view refreshed after Runtime State changes.
 * @param registry - Optional session-only Runtime Note State Registry.
 * @param canApply - Final revision check for the asynchronous registry mutation.
 * @returns Nothing.
 */
async function refreshRuntimeState(
  document: TextDocumentSnapshot,
  notes: ScopedWorkspaceNoteStore,
  notesProvider: NotesViewProvider | undefined,
  registry: RuntimeNoteStateRegistry | undefined,
  canApply: () => boolean,
): Promise<void> {
  const changed = await refreshRuntimeStateAfterDocumentChange(
    document,
    notes,
    registry,
    canApply,
  );
  if (changed) {
    await notesProvider?.refreshCurrentNotes(document.uri);
  }
}

/**
 * Refreshes session-only Runtime State after a save without mutating persistent Notes.
 *
 * @param notes - Shared workspace Note store.
 * @param document - Saved VS Code document.
 * @param notesProvider - Optional Notes view refreshed after persistence.
 * @param pendingDocumentChanges - Per-document save fallback state.
 * @param taskCoordinator - Shared per-resource queue and task validity owner.
 * @param runtimeNoteStateRegistry - Optional session registry receiving read-only detection.
 * @returns Promise resolved after save-time detection or suppression.
 */
async function handleSavedDocument(
  notes: WorkspaceNoteStore,
  document: vscode.TextDocument,
  notesProvider: NotesViewProvider | undefined,
  pendingDocumentChanges: Map<string, PendingDocumentChangeState>,
  taskCoordinator: ChangeTaskCoordinator,
  runtimeNoteStateRegistry: RuntimeNoteStateRegistry | undefined,
  noteScope: PersonalNoteScopeService | undefined,
): Promise<void> {
  const access = evaluateCzazaResourceAccess(document.uri);

  if (!access.allowed) {
    return;
  }

  const location = noteScope
    ? await noteScope.resolveLocation(
        access.root.rootDirectory,
        access.settings.outputDirectory,
      )
    : TEAM_NOTE_STORE;
  const scopedNotes = notes.scope(
    access.root.rootDirectory,
    access.settings.outputDirectory,
    location,
  );

  const key = document.uri.toString();
  const token = taskCoordinator.captureToken();
  await taskCoordinator.waitForIdle(key);

  if (!taskCoordinator.canApply(token)) {
    return;
  }

  const state = pendingDocumentChanges.get(key);

  pendingDocumentChanges.delete(key);

  if (state?.hasAppliedDeterministicChange && !state.hasUnsupportedChange) {
    return;
  }

  const changed = await refreshRuntimeStateAfterDocumentChange(
    createTextDocumentSnapshot(document),
    scopedNotes,
    runtimeNoteStateRegistry,
    () => taskCoordinator.canApply(token),
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

function createTextDocumentSnapshot(document: vscode.TextDocument): TextDocumentSnapshot {
  const text = document.getText();

  return {
    uri: document.uri,
    languageId: document.languageId,
    getText: () => text,
  };
}

/**
 * Schedules debounced external source inspection.
 *
 * @param uri - Changed workspace resource URI.
 * @param notes - Shared workspace Note store.
 * @param notesProvider - Optional Notes view refreshed after persistence.
 * @param recentlySavedTimers - Recently saved resources suppressed from rechecking.
 * @param taskCoordinator - Shared debounce, queue, and invalidation owner.
 * @param runtimeNoteStateRegistry - Optional session registry receiving text-file detection.
 * @returns Nothing.
 */
function scheduleExternalChangeCheck(
  uri: vscode.Uri,
  notes: WorkspaceNoteStore,
  notesProvider: NotesViewProvider | undefined,
  recentlySavedTimers: Map<string, ReturnType<typeof setTimeout>>,
  taskCoordinator: ChangeTaskCoordinator,
  runtimeNoteStateRegistry: RuntimeNoteStateRegistry | undefined,
  noteScope: PersonalNoteScopeService | undefined,
): void {
  const access = evaluateCzazaResourceAccess(uri);

  if (!access.allowed && access.reason === "noteStore") {
    if (!isRecentInternalWorkspaceNoteWrite(uri.fsPath)) {
      invalidateManagedNoteStore(uri, notes, notesProvider, taskCoordinator);
    }
    return;
  }

  if (!access.allowed) {
    return;
  }

  if (uri.scheme !== "file" || recentlySavedTimers.has(uri.toString())) {
    return;
  }

  const key = uri.toString();
  taskCoordinator.schedule(key, (token) =>
    handleExternalChange(
      notes,
      uri,
      notesProvider,
      taskCoordinator,
      token,
      runtimeNoteStateRegistry,
      noteScope,
    ),
  );
}

/**
 * Clears cached Notes and invalidates automatic tasks after Note Store changes externally.
 *
 * @param uri - Changed CZaza-managed Note Store resource.
 * @param notes - Shared workspace Note store.
 * @param notesProvider - Optional Notes view synchronized after cache invalidation.
 * @param taskCoordinator - Automatic task coordinator to invalidate.
 * @returns Nothing.
 */
function invalidateManagedNoteStore(
  uri: vscode.Uri,
  notes: WorkspaceNoteStore,
  notesProvider: NotesViewProvider | undefined,
  taskCoordinator: ChangeTaskCoordinator,
): void {
  try {
    const { rootDirectory } = resolveCzazaRootDirectory(uri);
    const settings = getCzazaSettings(uri);

    taskCoordinator.invalidate();
    notes.cache.clearAllLocationCaches(rootDirectory, settings.outputDirectory);
    const refreshKey = `note-store-refresh:${rootDirectory}:${settings.outputDirectory}`;
    taskCoordinator.schedule(refreshKey, () => {
      taskCoordinator.enqueue(refreshKey, async () => {
        await notesProvider?.refreshAfterExternalNoteStoreChange();
      });
    });
  } catch {
    // Out-of-scope Note Store events require no cache invalidation.
  }
}

/**
 * Applies one debounced external resource change.
 *
 * @param notes - Shared workspace Note store.
 * @param uri - Changed workspace resource URI.
 * @param notesProvider - Optional Notes view refreshed after persistence.
 * @param taskCoordinator - Shared per-resource queue and task validity owner.
 * @param token - Revision captured when the delayed task was scheduled.
 * @param runtimeNoteStateRegistry - Optional session registry receiving text-file detection.
 * @returns Promise resolved after inspection or suppression.
 */
async function handleExternalChange(
  notes: WorkspaceNoteStore,
  uri: vscode.Uri,
  notesProvider: NotesViewProvider | undefined,
  taskCoordinator: ChangeTaskCoordinator,
  token: ChangeTaskToken,
  runtimeNoteStateRegistry: RuntimeNoteStateRegistry | undefined,
  noteScope: PersonalNoteScopeService | undefined,
): Promise<void> {
  try {
    const scopedNotes = await resolveScopedNotes(uri, notes, noteScope);

    if (!scopedNotes) {
      return;
    }

    const fingerprint = await getResourceFingerprint(uri);

    if (fingerprint.kind === "text") {
      enqueueRuntimeStateRefresh(
        taskCoordinator,
        uri.toString(),
        createTextDocumentSnapshot(fingerprint.document),
        scopedNotes,
        notesProvider,
        runtimeNoteStateRegistry,
        () => taskCoordinator.canApply(token),
      );
      return;
    }

    if (fingerprint.kind === "binary") {
      taskCoordinator.enqueue(uri.toString(), async () => {
        if (!runtimeNoteStateRegistry) {
          return;
        }

        const result = await refreshBinaryRuntimeNoteStateService({
          uri,
          currentSourceHash: fingerprint.hash,
          notes: scopedNotes,
          registry: runtimeNoteStateRegistry,
          now: new Date().toISOString(),
          canApply: () => taskCoordinator.canApply(token),
        });

        if (result.registryChange !== "none") {
          await notesProvider?.refreshCurrentNotes(uri);
        }
      });
    }
  } catch (error) {
    console.error("Failed to inspect externally changed CZaza resource.", error);
  }
}

/**
 * Resolves one source event to a Store whose Team or Personal identity cannot change mid-task.
 *
 * @param uri - Source resource that identifies the CZaza project.
 * @param notes - Root Store that owns shared cache state.
 * @param noteScope - Optional UI scope resolver; tests explicitly fall back to Team.
 * @returns Scoped Store, or undefined when the resource is outside CZaza access.
 */
async function resolveScopedNotes(
  uri: vscode.Uri,
  notes: WorkspaceNoteStore,
  noteScope: PersonalNoteScopeService | undefined,
): Promise<ScopedWorkspaceNoteStore | undefined> {
  const access = evaluateCzazaResourceAccess(uri);

  if (!access.allowed) {
    return undefined;
  }

  const location = noteScope
    ? await noteScope.resolveLocation(
        access.root.rootDirectory,
        access.settings.outputDirectory,
      )
    : TEAM_NOTE_STORE;
  return notes.scope(
    access.root.rootDirectory,
    access.settings.outputDirectory,
    location,
  );
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
