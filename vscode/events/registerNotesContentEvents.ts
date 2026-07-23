/**
 * Registers VS Code document save events that refresh note status after content changes.
 */

import type { WorkspaceNoteStore } from "@vscode/notes";
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
import { applyTextDocumentChangeToNotesService } from "@vscode/services/textDocumentChanges/applyTextDocumentChangeToNotesService";
import {
  classifyTextDocumentChange,
  classifyTextDocumentContentChange,
  type ClassifiedTextDocumentChange,
} from "@vscode/services/textDocumentChanges/classifyTextDocumentChangeService";
import { isCzazaManagedRelativePath } from "@shared/utils/managedOutputPath";
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
 *
 * @example
 * registerNotesContentEvents(context, notes);
 */
export function registerNotesContentEvents(
  context: vscode.ExtensionContext,
  notes: WorkspaceNoteStore,
  notesProvider?: NotesViewProvider,
): void {
  const externalChangeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const notesRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingDocumentChanges = new Map<string, PendingDocumentChangeState>();
  const documentChangeQueues: DocumentChangeQueue = new Map();
  const recentlySavedTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const watcher = vscode.workspace.createFileSystemWatcher("**/*", true, false, true);

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      void handleTextDocumentChange(
        notes,
        event,
        notesProvider,
        pendingDocumentChanges,
        notesRefreshTimers,
        documentChangeQueues,
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
      );
    }),
    watcher.onDidChange((uri) => {
      scheduleExternalChangeCheck(
        uri,
        notes,
        notesProvider,
        externalChangeTimers,
        recentlySavedTimers,
      );
    }),
    watcher,
    {
      dispose: () => {
        clearTimers(externalChangeTimers);
        clearTimers(notesRefreshTimers);
        clearTimers(recentlySavedTimers);
        pendingDocumentChanges.clear();
        documentChangeQueues.clear();
      },
    },
  );
}

async function handleTextDocumentChange(
  notes: WorkspaceNoteStore,
  event: vscode.TextDocumentChangeEvent,
  notesProvider: NotesViewProvider | undefined,
  pendingDocumentChanges: Map<string, PendingDocumentChangeState>,
  notesRefreshTimers: Map<string, ReturnType<typeof setTimeout>>,
  documentChangeQueues: DocumentChangeQueue,
): Promise<void> {
  try {
    if (
      event.document.uri.scheme !== "file" ||
      isCzazaManagedResource(event.document.uri)
    ) {
      return;
    }

    const key = event.document.uri.toString();
    const classifiedChanges = classifyTextDocumentChanges(event);
    const state = getPendingDocumentChangeState(pendingDocumentChanges, key);

    if (classifiedChanges.length === 0) {
      state.hasUnsupportedChange = true;
      return;
    }

    const document = createTextDocumentSnapshot(event.document);

    for (const classifiedChange of classifiedChanges) {
      enqueueDocumentChange(documentChangeQueues, key, async () => {
        const result = await applyTextDocumentChangeToNotesService({
          document,
          change: classifiedChange,
          notes,
          now: new Date().toISOString(),
        });

        if (result.kind !== "updated") {
          return;
        }

        state.hasAppliedDeterministicChange = true;
        scheduleNotesRefresh(document.uri, notesProvider, notesRefreshTimers);
      });
    }
  } catch (error) {
    console.error("Failed to apply deterministic CZaza note updates after a text change.", error);
  }
}

function classifyTextDocumentChanges(
  event: vscode.TextDocumentChangeEvent,
): ClassifiedTextDocumentChange[] {
  if (event.contentChanges.length <= 1) {
    const classified = classifyTextDocumentChange(event);

    return classified.kind === "unsupported" ? [] : [classified];
  }

  const classifiedChanges = event.contentChanges.map((change) =>
    classifyTextDocumentContentChange(change),
  );

  return classifiedChanges.some((change) => change.kind === "unsupported")
    ? []
    : classifiedChanges;
}

async function handleSavedDocument(
  notes: WorkspaceNoteStore,
  document: vscode.TextDocument,
  notesProvider: NotesViewProvider | undefined,
  pendingDocumentChanges: Map<string, PendingDocumentChangeState>,
  documentChangeQueues: DocumentChangeQueue,
): Promise<void> {
  if (isCzazaManagedResource(document.uri)) {
    return;
  }

  const key = document.uri.toString();

  await documentChangeQueues.get(key);

  const state = pendingDocumentChanges.get(key);

  pendingDocumentChanges.delete(key);

  if (state?.hasAppliedDeterministicChange && !state.hasUnsupportedChange) {
    return;
  }

  await handleChangedDocument(notes, document, notesProvider, "save");
}

async function handleChangedDocument(
  notes: WorkspaceNoteStore,
  document: vscode.TextDocument,
  notesProvider: NotesViewProvider | undefined,
  trigger: "save" | "externalChange",
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

function scheduleExternalChangeCheck(
  uri: vscode.Uri,
  notes: WorkspaceNoteStore,
  notesProvider: NotesViewProvider | undefined,
  externalChangeTimers: Map<string, ReturnType<typeof setTimeout>>,
  recentlySavedTimers: Map<string, ReturnType<typeof setTimeout>>,
): void {
  if (
    uri.scheme !== "file" ||
    isCzazaManagedResource(uri) ||
    recentlySavedTimers.has(uri.toString())
  ) {
    return;
  }

  const key = uri.toString();
  const previousTimer = externalChangeTimers.get(key);

  if (previousTimer) {
    clearTimeout(previousTimer);
  }

  externalChangeTimers.set(
    key,
    setTimeout(() => {
      externalChangeTimers.delete(key);
      void handleExternalChange(notes, uri, notesProvider);
    }, EXTERNAL_CHANGE_DEBOUNCE_MS),
  );
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

async function handleExternalChange(
  notes: WorkspaceNoteStore,
  uri: vscode.Uri,
  notesProvider: NotesViewProvider | undefined,
): Promise<void> {
  try {
    const fingerprint = await getResourceFingerprint(uri);

    if (fingerprint.kind === "text") {
      await handleChangedDocument(notes, fingerprint.document, notesProvider, "externalChange");
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
        await notes.cache.saveSourceFile(
          rootDirectory,
          settings.outputDirectory,
          relativePath,
          updatedSourceFile,
          new Date().toISOString(),
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
