/**
 * Registers VS Code document save events that refresh note status after content changes.
 */

import type { WorkspaceNoteStore } from "@vscode/notes";
import { isRecentInternalWorkspaceNoteWrite } from "@vscode/notes/WorkspaceNoteStoreRepository";
import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";
import { checkChangedFileNotesService } from "@vscode/services/checkChangedFileNotesService";
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
import {
  GitAwareSourceChangeGate,
  type GitWorkspaceTransitionGuard,
  type SourceChangeRevisionToken,
} from "@vscode/services/workspaceTransition";
import {
  applySourceChangeToNotesService,
  classifySourceChangeBatch,
} from "@vscode/services/noteRelocation";
import {
  isCzazaManagedRelativePath,
} from "@shared/utils/managedOutputPath";
import * as vscode from "vscode";

const EXTERNAL_CHANGE_DEBOUNCE_MS = 800;
const NOTES_REFRESH_DEBOUNCE_MS = 500;
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
): void {
  const sourceChangeGate = new GitAwareSourceChangeGate(
    EXTERNAL_CHANGE_DEBOUNCE_MS,
    workspaceTransitionGuard,
  );
  const notesRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingDocumentChanges = new Map<string, PendingDocumentChangeState>();
  const documentChangeQueues: DocumentChangeQueue = new Map();
  const recentlySavedTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const watcher = vscode.workspace.createFileSystemWatcher("**/*", true, false, true);
  const transitionDisposable = workspaceTransitionGuard?.onDidStartTransition(
    () => {
      sourceChangeGate.cancelPending();
      clearTimers(notesRefreshTimers);
      clearTimers(recentlySavedTimers);
      pendingDocumentChanges.clear();
      documentChangeQueues.clear();
    },
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      void handleTextDocumentChange(
        notes,
        event,
        notesProvider,
        pendingDocumentChanges,
        notesRefreshTimers,
        documentChangeQueues,
        workspaceTransitionGuard,
        sourceChangeGate,
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
      );
    }),
    watcher.onDidChange((uri) => {
      scheduleExternalChangeCheck(
        uri,
        notes,
        notesProvider,
        recentlySavedTimers,
        workspaceTransitionGuard,
        sourceChangeGate,
      );
    }),
    watcher,
    ...(transitionDisposable ? [transitionDisposable] : []),
    {
      dispose: () => {
        sourceChangeGate.dispose();
        clearTimers(notesRefreshTimers);
        clearTimers(recentlySavedTimers);
        pendingDocumentChanges.clear();
        documentChangeQueues.clear();
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
 * @param notesRefreshTimers - Per-document refresh debounce timers.
 * @param documentChangeQueues - Per-document serialized update queues.
 * @param sourceChangeGate - Git-aware revision gate for automatic persistence.
 * @returns Promise resolved after the event has been classified and queued.
 */
async function handleTextDocumentChange(
  notes: WorkspaceNoteStore,
  event: vscode.TextDocumentChangeEvent,
  notesProvider: NotesViewProvider | undefined,
  pendingDocumentChanges: Map<string, PendingDocumentChangeState>,
  notesRefreshTimers: Map<string, ReturnType<typeof setTimeout>>,
  documentChangeQueues: DocumentChangeQueue,
  workspaceTransitionGuard: GitWorkspaceTransitionGuard | undefined,
  sourceChangeGate: GitAwareSourceChangeGate,
): Promise<void> {
  try {
    if (workspaceTransitionGuard?.isTransitioning()) {
      workspaceTransitionGuard.touchTransition();
      return;
    }

    if (event.document.isDirty === false) {
      return;
    }

    if (
      event.document.uri.scheme !== "file" ||
      isCzazaManagedResource(event.document.uri)
    ) {
      return;
    }

    const key = event.document.uri.toString();
    const classifiedBatch = classifySourceChangeBatch(event);
    const state = getPendingDocumentChangeState(pendingDocumentChanges, key);

    if (classifiedBatch.kind === "unsupported") {
      state.hasUnsupportedChange = true;
      return;
    }

    const document = createTextDocumentSnapshot(event.document);
    const token = sourceChangeGate.captureToken();

    enqueueDocumentChange(documentChangeQueues, key, async () => {
      if (workspaceTransitionGuard?.isTransitioning()) {
        workspaceTransitionGuard.touchTransition();
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

      state.hasAppliedDeterministicChange = true;
      scheduleNotesRefresh(document.uri, notesProvider, notesRefreshTimers);
    });
  } catch (error) {
    console.error("Failed to apply deterministic CZaza note updates after a text change.", error);
  }
}

/**
 * Handles a document save unless Git is currently replacing workspace files.
 *
 * @param notes - Shared workspace Note store.
 * @param document - Saved VS Code document.
 * @param notesProvider - Optional Notes view refreshed after persistence.
 * @param pendingDocumentChanges - Per-document save fallback state.
 * @param documentChangeQueues - Per-document serialized update queues.
 * @param workspaceTransitionGuard - Optional Git transition state.
 * @param sourceChangeGate - Git-aware revision gate for automatic persistence.
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
): Promise<void> {
  if (workspaceTransitionGuard?.isTransitioning()) {
    workspaceTransitionGuard.touchTransition();
    return;
  }

  if (isCzazaManagedResource(document.uri)) {
    return;
  }

  const key = document.uri.toString();
  const token = sourceChangeGate.captureToken();

  await documentChangeQueues.get(key);

  if (!sourceChangeGate.canPersist(token)) {
    return;
  }

  const state = pendingDocumentChanges.get(key);

  pendingDocumentChanges.delete(key);

  if (state?.hasAppliedDeterministicChange && !state.hasUnsupportedChange) {
    return;
  }

  await handleChangedDocument(
    notes,
    document,
    notesProvider,
    "save",
    sourceChangeGate,
    token,
  );
}

/**
 * Runs full stale detection with a final Git revision persistence check.
 *
 * @param notes - Shared workspace Note store.
 * @param document - Current source document.
 * @param notesProvider - Optional Notes view refreshed after persistence.
 * @param trigger - Source event used for error reporting.
 * @param sourceChangeGate - Git-aware revision gate.
 * @param token - Revision captured before the automatic task started.
 * @returns Promise resolved after detection or cancellation.
 */
async function handleChangedDocument(
  notes: WorkspaceNoteStore,
  document: vscode.TextDocument,
  notesProvider: NotesViewProvider | undefined,
  trigger: "save" | "externalChange",
  sourceChangeGate: GitAwareSourceChangeGate,
  token: SourceChangeRevisionToken,
): Promise<void> {
  try {
    if (document.uri.scheme !== "file") {
      return;
    }

    const now = new Date().toISOString();
    const result = await checkChangedFileNotesService({
      document,
      notes,
      now,
      canPersist: () => sourceChangeGate.canPersist(token),
    });

    if (result.kind !== "updated") {
      return;
    }

    await notesProvider?.refreshCurrentNotes(document.uri);
  } catch (error) {
    console.error(`Failed to update CZaza note freshness after a file ${trigger}.`, error);
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

function scheduleNotesRefresh(
  uri: vscode.Uri,
  notesProvider: NotesViewProvider | undefined,
  notesRefreshTimers: Map<string, ReturnType<typeof setTimeout>>,
): void {
  if (!notesProvider) {
    return;
  }

  const key = uri.toString();
  const previousTimer = notesRefreshTimers.get(key);

  if (previousTimer) {
    clearTimeout(previousTimer);
  }

  notesRefreshTimers.set(
    key,
    setTimeout(() => {
      notesRefreshTimers.delete(key);
      void notesProvider.refreshCurrentNotes(uri);
    }, NOTES_REFRESH_DEBOUNCE_MS),
  );
}

/**
 * Schedules external source inspection unless a Git transition is active.
 *
 * @param uri - Changed workspace resource URI.
 * @param notes - Shared workspace Note store.
 * @param notesProvider - Optional Notes view refreshed after persistence.
 * @param recentlySavedTimers - Recently saved resources suppressed from rechecking.
 * @param workspaceTransitionGuard - Optional Git transition state.
 * @param sourceChangeGate - Git-aware debounce and revision gate.
 * @returns Nothing.
 */
function scheduleExternalChangeCheck(
  uri: vscode.Uri,
  notes: WorkspaceNoteStore,
  notesProvider: NotesViewProvider | undefined,
  recentlySavedTimers: Map<string, ReturnType<typeof setTimeout>>,
  workspaceTransitionGuard: GitWorkspaceTransitionGuard | undefined,
  sourceChangeGate: GitAwareSourceChangeGate,
): void {
  if (isCzazaManagedResource(uri)) {
    if (!isRecentInternalWorkspaceNoteWrite(uri.fsPath)) {
      invalidateManagedNoteStore(uri, notes, sourceChangeGate);
    }
    return;
  }

  if (workspaceTransitionGuard?.isTransitioning()) {
    workspaceTransitionGuard.touchTransition();
    return;
  }

  if (
    uri.scheme !== "file" ||
    recentlySavedTimers.has(uri.toString())
  ) {
    return;
  }

  const key = uri.toString();
  sourceChangeGate.schedule(key, (token) =>
    handleExternalChange(
      notes,
      uri,
      notesProvider,
      workspaceTransitionGuard,
      sourceChangeGate,
      token,
    ),
  );
}

/**
 * Clears cached Notes and invalidates automatic tasks after managed output changes externally.
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
    // Out-of-scope managed output events require no cache invalidation.
  }
}

function isCzazaManagedResource(uri: vscode.Uri): boolean {
  if (uri.scheme !== "file") {
    return false;
  }

  try {
    const { rootDirectory } = resolveCzazaRootDirectory(uri);
    const settings = getCzazaSettings(uri);
    const relativePath = getCzazaRelativePath(uri, rootDirectory);

    return isCzazaManagedRelativePath(
      rootDirectory,
      settings.outputDirectory,
      relativePath,
    );
  } catch {
    return false;
  }
}

/**
 * Applies one external resource change unless Git is replacing workspace files.
 *
 * @param notes - Shared workspace Note store.
 * @param uri - Changed workspace resource URI.
 * @param notesProvider - Optional Notes view refreshed after persistence.
 * @param workspaceTransitionGuard - Optional Git transition state.
 * @param sourceChangeGate - Git-aware revision gate.
 * @param token - Revision captured when the delayed task was scheduled.
 * @returns Promise resolved after inspection or suppression.
 */
async function handleExternalChange(
  notes: WorkspaceNoteStore,
  uri: vscode.Uri,
  notesProvider: NotesViewProvider | undefined,
  workspaceTransitionGuard: GitWorkspaceTransitionGuard | undefined,
  sourceChangeGate: GitAwareSourceChangeGate,
  token: SourceChangeRevisionToken,
): Promise<void> {
  try {
    if (workspaceTransitionGuard?.isTransitioning()) {
      workspaceTransitionGuard.touchTransition();
      return;
    }

    const fingerprint = await getResourceFingerprint(uri);

    if (fingerprint.kind === "text") {
      await handleChangedDocument(
        notes,
        fingerprint.document,
        notesProvider,
        "externalChange",
        sourceChangeGate,
        token,
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
