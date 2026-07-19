/**
 * Unit tests for refreshing note status after saved content changes.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type * as vscodeTypes from "vscode";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { createSourceHash } from "@shared/utils/hashUtils";

type SaveListener = (document: vscodeTypes.TextDocument) => void;
type ChangeListener = (uri: vscodeTypes.Uri) => void;
type TextDocumentChangeListener = (event: vscodeTypes.TextDocumentChangeEvent) => void;
type MockWorkspaceFolder = {
  uri: vscodeTypes.Uri;
  name: string;
  index: number;
};

const mocks = vi.hoisted(() => ({
  workspaceFolders: [] as MockWorkspaceFolder[],
  configuredRootDirectory: "",
  outputDirectory: ".caca",
  textDocumentChangeListeners: [] as TextDocumentChangeListener[],
  saveListeners: [] as SaveListener[],
  changeListeners: [] as ChangeListener[],
  openTextDocument: vi.fn(),
  watcherDispose: vi.fn(),
}));

vi.mock("vscode", () => ({
  FileType: { File: 1, Directory: 2 },
  workspace: {
    get workspaceFolders() {
      return mocks.workspaceFolders;
    },

    fs: {
      stat: vi.fn().mockResolvedValue({ type: 1, size: 100, mtime: 2, ctime: 1 }),
    },

    getConfiguration: () => ({
      get: <T>(key: string, defaultValue: T): T => {
        if (key === "rootDirectory") {
          return mocks.configuredRootDirectory as T;
        }

        if (key === "outputDirectory") {
          return mocks.outputDirectory as T;
        }

        return defaultValue;
      },
    }),

    getWorkspaceFolder: (uri: vscodeTypes.Uri) =>
      mocks.workspaceFolders.find((folder) => {
        const relativePath = path.relative(folder.uri.fsPath, uri.fsPath);
        return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
      }),

    onDidSaveTextDocument: (listener: SaveListener) => {
      mocks.saveListeners.push(listener);
      return { dispose: vi.fn() };
    },

    onDidChangeTextDocument: (listener: TextDocumentChangeListener) => {
      mocks.textDocumentChangeListeners.push(listener);
      return { dispose: vi.fn() };
    },

    createFileSystemWatcher: vi.fn(() => ({
      onDidChange: (listener: ChangeListener) => {
        mocks.changeListeners.push(listener);
        return { dispose: vi.fn() };
      },
      dispose: mocks.watcherDispose,
    })),

    openTextDocument: mocks.openTextDocument,
  },
}));

import { registerNotesContentEvents } from "@vscode/events";
import type { WorkspaceNoteStore } from "@vscode/notes";
import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";

describe("registerNotesContentEvents()", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.workspaceFolders.length = 0;
    mocks.textDocumentChangeListeners.length = 0;
    mocks.saveListeners.length = 0;
    mocks.changeListeners.length = 0;
    mocks.openTextDocument.mockReset();
    mocks.watcherDispose.mockReset();
    mocks.configuredRootDirectory = "";
    mocks.outputDirectory = ".caca";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks file, section, and line notes stale after a saved content change", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("changed");
    const previousText = "export const value = 1;\n";
    const nextText = "export const value = 2;\n";
    const sourceFile = createStoredSourceFile(previousText);
    const notes = createNotes(sourceFile);
    const notesProvider = createNotesProvider();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(createExtensionContext(), notes.value, notesProvider.value);
    const document = createDocument(path.join(workspaceRoot, "src/index.ts"), nextText);
    mocks.saveListeners[0]?.(document);

    await waitForMicrotasks();

    expect(notes.saveSourceFile).toHaveBeenCalledOnce();
    expect(notes.saveSourceFile).toHaveBeenCalledWith(
      workspaceRoot,
      ".caca",
      "src/index.ts",
      expect.objectContaining({
        source: {
          sourceHash: createSourceHash(nextText),
          programmingLanguage: "typescript",
        },
        fileNote: expect.objectContaining({
          status: {
            content: "stale",
            anchor: "confirmed",
          },
        }),
        sectionNotes: [
          expect.objectContaining({
            status: {
              content: "stale",
              anchor: "needsConfirmation",
            },
          }),
        ],
        lineNotes: [
          expect.objectContaining({
            status: {
              content: "stale",
              anchor: "needsConfirmation",
            },
          }),
        ],
      }),
      expect.any(String),
    );
    expect(notesProvider.refreshCurrentNotes).toHaveBeenCalledWith(document.uri);
  });

  it("does not save when the source hash is unchanged", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("unchanged");
    const sourceText = "export const value = 1;\n";
    const notes = createNotes(createStoredSourceFile(sourceText));
    const notesProvider = createNotesProvider();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(createExtensionContext(), notes.value, notesProvider.value);
    mocks.saveListeners[0]?.(createDocument(path.join(workspaceRoot, "src/index.ts"), sourceText));

    await waitForMicrotasks();

    expect(notes.saveSourceFile).not.toHaveBeenCalled();
    expect(notesProvider.refreshCurrentNotes).not.toHaveBeenCalled();
  });

  it("does not save when the source file has no stored notes", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("missing");
    const notes = createNotes(undefined);

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(createExtensionContext(), notes.value);
    mocks.saveListeners[0]?.(createDocument(path.join(workspaceRoot, "src/index.ts"), "export {};\n"));

    await waitForMicrotasks();

    expect(notes.saveSourceFile).not.toHaveBeenCalled();
  });

  it("checks externally changed files after a debounce", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("external");
    const previousText = "export const value = 1;\n";
    const nextText = "export const value = 2;\n";
    const notes = createNotes(createStoredSourceFile(previousText));
    const notesProvider = createNotesProvider();
    const document = createDocument(path.join(workspaceRoot, "src/index.ts"), nextText);

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.openTextDocument.mockResolvedValue(document);
    registerNotesContentEvents(createExtensionContext(), notes.value, notesProvider.value);
    mocks.changeListeners[0]?.(document.uri);

    await vi.advanceTimersByTimeAsync(799);
    expect(notes.saveSourceFile).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(mocks.openTextDocument).toHaveBeenCalledWith(document.uri);
    expect(notes.saveSourceFile).toHaveBeenCalledOnce();
    expect(notesProvider.refreshCurrentNotes).toHaveBeenCalledWith(document.uri);

    vi.useRealTimers();
  });

  it("debounces repeated external changes for the same file", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("debounced");
    const previousText = "export const value = 1;\n";
    const nextText = "export const value = 2;\n";
    const notes = createNotes(createStoredSourceFile(previousText));
    const document = createDocument(path.join(workspaceRoot, "src/index.ts"), nextText);

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.openTextDocument.mockResolvedValue(document);
    registerNotesContentEvents(createExtensionContext(), notes.value);
    mocks.changeListeners[0]?.(document.uri);
    await vi.advanceTimersByTimeAsync(400);
    mocks.changeListeners[0]?.(document.uri);
    await vi.advanceTimersByTimeAsync(799);

    expect(mocks.openTextDocument).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(mocks.openTextDocument).toHaveBeenCalledOnce();
    expect(notes.saveSourceFile).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  it("suppresses watcher changes caused by VS Code saves", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("suppressed");
    const previousText = "export const value = 1;\n";
    const nextText = "export const value = 2;\n";
    const notes = createNotes(createStoredSourceFile(previousText));
    const document = createDocument(path.join(workspaceRoot, "src/index.ts"), nextText);

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.openTextDocument.mockResolvedValue(document);
    registerNotesContentEvents(createExtensionContext(), notes.value);
    mocks.saveListeners[0]?.(document);
    mocks.changeListeners[0]?.(document.uri);

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(800);

    expect(mocks.openTextDocument).not.toHaveBeenCalled();
    expect(notes.saveSourceFile).toHaveBeenCalledOnce();
  });

  it("applies deterministic text changes immediately and refreshes notes after 500ms", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("deterministic");
    const previousText = "export const value = 1;\n";
    const nextText = "export const value = 2;\n";
    const notes = createNotes(createStoredSourceFile(previousText));
    const notesProvider = createNotesProvider();
    const document = createDocument(path.join(workspaceRoot, "src/index.ts"), nextText);

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(createExtensionContext(), notes.value, notesProvider.value);
    mocks.textDocumentChangeListeners[0]?.({
      document,
      contentChanges: [
        {
          range: {
            start: { line: 0, character: 21 },
            end: { line: 0, character: 22 },
          },
          rangeLength: 1,
          text: "2",
        },
      ],
    } as unknown as vscodeTypes.TextDocumentChangeEvent);

    await vi.advanceTimersByTimeAsync(499);
    expect(notes.saveSourceFile).toHaveBeenCalledOnce();
    expect(notesProvider.refreshCurrentNotes).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(notesProvider.refreshCurrentNotes).toHaveBeenCalledWith(document.uri);
    expect(notes.saveSourceFile).toHaveBeenCalledWith(
      workspaceRoot,
      ".caca",
      "src/index.ts",
      expect.objectContaining({
        source: {
          sourceHash: createSourceHash(nextText),
          programmingLanguage: "typescript",
        },
        fileNote: expect.objectContaining({
          status: {
            content: "stale",
            anchor: "confirmed",
          },
        }),
        sectionNotes: [
          expect.objectContaining({
            anchorHash: createSourceHash("export const value = 1;"),
            status: {
              content: "stale",
              anchor: "confirmed",
            },
          }),
        ],
        lineNotes: [
          expect.objectContaining({
            anchorText: "export const value = 1;",
            status: {
              content: "stale",
              anchor: "confirmed",
            },
          }),
        ],
      }),
      expect.any(String),
    );
  });

  it("serializes repeated deterministic text changes for the same unsaved document", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("queued-deterministic");
    const previousText = "export const value = 1;\n";
    const firstText = "const first = 1;\nexport const value = 1;\n";
    const secondText = "const first = 1;\nconst second = 2;\nexport const value = 1;\n";
    const notes = createNotes(createStoredSourceFile(previousText));
    const documentPath = path.join(workspaceRoot, "src/index.ts");

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(createExtensionContext(), notes.value);
    mocks.textDocumentChangeListeners[0]?.({
      document: createDocument(documentPath, firstText),
      contentChanges: [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
            isEmpty: true,
          },
          rangeLength: 0,
          text: "const first = 1;\n",
        },
      ],
    } as unknown as vscodeTypes.TextDocumentChangeEvent);
    mocks.textDocumentChangeListeners[0]?.({
      document: createDocument(documentPath, secondText),
      contentChanges: [
        {
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 0 },
            isEmpty: true,
          },
          rangeLength: 0,
          text: "const second = 2;\n",
        },
      ],
    } as unknown as vscodeTypes.TextDocumentChangeEvent);

    await vi.advanceTimersByTimeAsync(0);

    expect(notes.saveSourceFile).toHaveBeenCalledTimes(2);
    expect(notes.saveSourceFile).toHaveBeenLastCalledWith(
      workspaceRoot,
      ".caca",
      "src/index.ts",
      expect.objectContaining({
        sectionNotes: [
          expect.objectContaining({
            range: {
              startLine: 1,
              endLine: 3,
            },
          }),
        ],
      }),
      expect.any(String),
    );
  });

  it("applies multiple deterministic changes from one VS Code event", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("multi-change-deterministic");
    const previousText = "export const value = 1;\n";
    const nextText = "const first = 1;\nconst second = 2;\nexport const value = 1;\n";
    const notes = createNotes(createStoredSourceFile(previousText));
    const documentPath = path.join(workspaceRoot, "src/index.ts");

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(createExtensionContext(), notes.value);
    mocks.textDocumentChangeListeners[0]?.({
      document: createDocument(documentPath, nextText),
      contentChanges: [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
            isEmpty: true,
          },
          rangeLength: 0,
          text: "const first = 1;\n",
        },
        {
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 0 },
            isEmpty: true,
          },
          rangeLength: 0,
          text: "const second = 2;\n",
        },
      ],
    } as unknown as vscodeTypes.TextDocumentChangeEvent);

    await vi.advanceTimersByTimeAsync(0);

    expect(notes.saveSourceFile).toHaveBeenCalledTimes(2);
    expect(notes.saveSourceFile).toHaveBeenLastCalledWith(
      workspaceRoot,
      ".caca",
      "src/index.ts",
      expect.objectContaining({
        sectionNotes: [
          expect.objectContaining({
            range: {
              startLine: 1,
              endLine: 3,
            },
          }),
        ],
      }),
      expect.any(String),
    );
  });

  it("skips save-time full detection after deterministic-only changes", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("skip-save");
    const previousText = "export const value = 1;\n";
    const nextText = "export const value = 2;\n";
    const notes = createNotes(createStoredSourceFile(previousText));
    const document = createDocument(path.join(workspaceRoot, "src/index.ts"), nextText);

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(createExtensionContext(), notes.value);
    mocks.textDocumentChangeListeners[0]?.({
      document,
      contentChanges: [
        {
          range: {
            start: { line: 0, character: 21 },
            end: { line: 0, character: 22 },
          },
          rangeLength: 1,
          text: "2",
        },
      ],
    } as unknown as vscodeTypes.TextDocumentChangeEvent);
    await vi.advanceTimersByTimeAsync(0);
    mocks.saveListeners[0]?.(document);
    await vi.advanceTimersByTimeAsync(0);

    expect(notes.saveSourceFile).toHaveBeenCalledOnce();
  });

  it("runs save-time full detection after unsupported text changes", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("unsupported-save");
    const previousText = "export const value = 1;\n";
    const nextText = "export const value = 2;\n";
    const notes = createNotes(createStoredSourceFile(previousText));
    const document = createDocument(path.join(workspaceRoot, "src/index.ts"), nextText);

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(createExtensionContext(), notes.value);
    mocks.textDocumentChangeListeners[0]?.({
      document,
      contentChanges: [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 1, character: 0 },
          },
          rangeLength: 24,
          text: "replacement\ntext\n",
        },
      ],
    } as unknown as vscodeTypes.TextDocumentChangeEvent);
    mocks.saveListeners[0]?.(document);
    await vi.advanceTimersByTimeAsync(0);

    expect(notes.saveSourceFile).toHaveBeenCalledOnce();
    expect(notes.saveSourceFile).toHaveBeenCalledWith(
      workspaceRoot,
      ".caca",
      "src/index.ts",
      expect.objectContaining({
        sectionNotes: [
          expect.objectContaining({
            status: {
              content: "stale",
              anchor: "needsConfirmation",
            },
          }),
        ],
      }),
      expect.any(String),
    );
  });
});

function createNotes(sourceFile: StoredSourceFile | undefined): {
  value: WorkspaceNoteStore;
  saveSourceFile: ReturnType<typeof vi.fn>;
} {
  let cachedSourceFile = sourceFile;
  const saveSourceFile = vi.fn().mockImplementation(async (
    _workspaceRoot: string,
    _outputDirectory: string,
    _relativePath: string,
    nextSourceFile: StoredSourceFile,
  ) => {
    cachedSourceFile = nextSourceFile;
  });

  return {
    value: {
      cache: {
        getSourceFile: vi.fn().mockImplementation(async () => cachedSourceFile),
        saveSourceFile,
      },
    } as unknown as WorkspaceNoteStore,
    saveSourceFile,
  };
}

function createNotesProvider(): {
  value: NotesViewProvider;
  refreshCurrentNotes: ReturnType<typeof vi.fn>;
} {
  const refreshCurrentNotes = vi.fn().mockResolvedValue(undefined);

  return {
    value: { refreshCurrentNotes } as unknown as NotesViewProvider,
    refreshCurrentNotes,
  };
}

function createStoredSourceFile(sourceText: string): StoredSourceFile {
  return {
    source: {
      sourceHash: createSourceHash(sourceText),
      programmingLanguage: "typescript",
    },
    fileNote: {
      id: "file",
      userNote: "File note.",
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "user",
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
    },
    sectionNotes: [
      {
        id: "section:1",
        title: "Export value",
        range: {
          startLine: 1,
          endLine: 1,
        },
        anchorHash: createSourceHash(sourceText.split(/\r?\n/)[0] ?? ""),
        userNote: "Section note.",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "user",
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
      },
    ],
    lineNotes: [
      {
        id: "line:1",
        line: 1,
        anchorText: sourceText.split(/\r?\n/)[0] ?? "",
        userNote: "Line note.",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "user",
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
      },
    ],
  };
}

function createExtensionContext(): vscodeTypes.ExtensionContext {
  return {
    subscriptions: [],
  } as unknown as vscodeTypes.ExtensionContext;
}

function createWorkspaceFolder(fsPath: string): MockWorkspaceFolder {
  return {
    uri: createUri(fsPath),
    name: path.basename(fsPath),
    index: 0,
  };
}

function createDocument(fsPath: string, text: string): vscodeTypes.TextDocument {
  return {
    uri: createUri(fsPath),
    languageId: "typescript",
    getText: () => text,
  } as vscodeTypes.TextDocument;
}

function createUri(fsPath: string): vscodeTypes.Uri {
  return {
    scheme: "file",
    fsPath,
    toString: () => `file://${fsPath}`,
  } as vscodeTypes.Uri;
}

async function waitForMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function createTempWorkspaceRoot(name: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `czaza-content-events-${name}-`));
}
