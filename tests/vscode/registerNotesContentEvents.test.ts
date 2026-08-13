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
type CloseListener = (document: vscodeTypes.TextDocument) => void;
type ChangeListener = (uri: vscodeTypes.Uri) => void;
type DeleteListener = (uri: vscodeTypes.Uri) => void;
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
  closeListeners: [] as CloseListener[],
  changeListeners: [] as ChangeListener[],
  deleteListeners: [] as DeleteListener[],
  openTextDocument: vi.fn(),
  fsStat: vi.fn(),
  watcherDispose: vi.fn(),
}));

vi.mock("vscode", () => ({
  FileType: { File: 1, Directory: 2 },
  TextDocumentChangeReason: { Undo: 1, Redo: 2 },
  workspace: {
    get workspaceFolders() {
      return mocks.workspaceFolders;
    },

    fs: {
      stat: mocks.fsStat,
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

    onDidCloseTextDocument: (listener: CloseListener) => {
      mocks.closeListeners.push(listener);
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
      onDidDelete: (listener: DeleteListener) => {
        mocks.deleteListeners.push(listener);
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
import { RuntimeNoteStateRegistry } from "@vscode/services/runtimeState";
import {
  ChangeTaskCoordinator,
} from "@vscode/services/changeCoordination";

describe("registerNotesContentEvents()", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.workspaceFolders.length = 0;
    mocks.textDocumentChangeListeners.length = 0;
    mocks.saveListeners.length = 0;
    mocks.closeListeners.length = 0;
    mocks.changeListeners.length = 0;
    mocks.deleteListeners.length = 0;
    mocks.openTextDocument.mockReset();
    mocks.fsStat.mockReset().mockResolvedValue({
      type: 1,
      size: 100,
      mtime: 2,
      ctime: 1,
    });
    mocks.watcherDispose.mockReset();
    mocks.configuredRootDirectory = "";
    mocks.outputDirectory = ".caca";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records saved content changes in Runtime State without persisting Notes", async () => {
    vi.useFakeTimers();
    const workspaceRoot = await createTempWorkspaceRoot("changed");
    const previousText = "export const value = 1;\n";
    const nextText = "export const value = 2;\n";
    const sourceFile = createStoredSourceFile(previousText);
    const notes = createNotes(sourceFile);
    const notesProvider = createNotesProvider();
    const runtimeRegistry = new RuntimeNoteStateRegistry();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(
      createExtensionContext(),
      notes.value,
      notesProvider.value,
      runtimeRegistry,
    );
    const document = createDocument(path.join(workspaceRoot, "src/index.ts"), nextText);
    mocks.saveListeners[0]?.(document);

    await vi.advanceTimersByTimeAsync(0);

    expect(notes.saveSourceFile).not.toHaveBeenCalled();
    expect(
      runtimeRegistry.getState({
        workspaceRoot,
        outputDirectory: ".caca",
        relativePath: "src/index.ts",
      }),
    ).toEqual(
      expect.objectContaining({
        currentSourceHash: createSourceHash(nextText),
        issues: expect.arrayContaining(["stale", "locationReview"]),
      }),
    );
    expect(notesProvider.refreshCurrentNotes).toHaveBeenCalledWith(document.uri);
  });

  it("treats clean external document reloads as read-only detection", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("clean-checkout-reload");
    const previousText = createNumberedSourceLines(35);
    const nextText = createNumberedSourceLines(6, 30);
    const sourceFile = createStoredSourceFile(previousText);
    sourceFile.sectionNotes[0]!.range = { startLine: 30, endLine: 30 };
    sourceFile.lineNotes[0]!.line = 30;
    const notes = createNotes(sourceFile);
    const document = createDocument(
      path.join(workspaceRoot, "src/index.ts"),
      nextText,
      false,
    );

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(createExtensionContext(), notes.value);
    mocks.textDocumentChangeListeners[0]?.({
      document,
      contentChanges: [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 29, character: 0 },
          },
          rangeLength: previousText.length - nextText.length,
          text: "",
        },
      ],
    } as unknown as vscodeTypes.TextDocumentChangeEvent);

    await waitForMicrotasks();

    expect(notes.saveSourceFile).not.toHaveBeenCalled();
  });

  it("relocates notes for the same deletion when the document is dirty", async () => {
    vi.useFakeTimers();
    const workspaceRoot = await createTempWorkspaceRoot("dirty-user-deletion");
    const previousText = createNumberedSourceLines(35);
    const nextText = createNumberedSourceLines(6, 30);
    const sourceFile = createStoredSourceFile(previousText);
    sourceFile.sectionNotes[0]!.range = { startLine: 30, endLine: 30 };
    sourceFile.lineNotes[0]!.line = 30;
    const notes = createNotes(sourceFile);
    const document = createDocument(
      path.join(workspaceRoot, "src/index.ts"),
      nextText,
      true,
    );

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(createExtensionContext(), notes.value);
    mocks.textDocumentChangeListeners[0]?.({
      document,
      contentChanges: [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 29, character: 0 },
          },
          rangeLength: previousText.length - nextText.length,
          text: "",
        },
      ],
    } as unknown as vscodeTypes.TextDocumentChangeEvent);

    await vi.advanceTimersByTimeAsync(0);

    expect(notes.saveSourceFile).toHaveBeenCalledOnce();
    expect(notes.saveSourceFile).toHaveBeenCalledWith(
      workspaceRoot,
      ".caca",
      "src/index.ts",
      expect.objectContaining({
        sectionNotes: [
          expect.objectContaining({
            range: { startLine: 1, endLine: 1 },
          }),
        ],
        lineNotes: [
          expect.objectContaining({
            line: 1,
          }),
        ],
      }),
      expect.any(String),
      { canPersist: expect.any(Function) },
    );
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

  it("rechecks a Watcher Delete target that reappears before marking it missing", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("restored-delete");
    const previousText = "export const value = 1;\n";
    const nextText = "export const value = 2;\n";
    const notes = createNotes(createStoredSourceFile(previousText));
    const runtimeRegistry = new RuntimeNoteStateRegistry();
    const document = createDocument(
      path.join(workspaceRoot, "src/index.ts"),
      nextText,
    );

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.openTextDocument.mockResolvedValue(document);
    registerNotesContentEvents(
      createExtensionContext(),
      notes.value,
      undefined,
      runtimeRegistry,
    );
    mocks.deleteListeners[0]?.(document.uri);

    await vi.advanceTimersByTimeAsync(800);
    await vi.advanceTimersByTimeAsync(0);

    const state = runtimeRegistry.getState({
      workspaceRoot,
      outputDirectory: ".caca",
      relativePath: "src/index.ts",
    });

    expect(state?.issues).toContain("stale");
    expect(state?.issues).not.toContain("missing");
    expect(state?.targetChanges).toContainEqual({
      kind: "file",
      status: {
        content: "stale",
        anchor: "confirmed",
      },
    });
    expect(notes.saveSourceFile).not.toHaveBeenCalled();
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

  it("ignores saves and watcher changes inside the Note Store directory", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("managed-output");
    const notes = createNotes(createStoredSourceFile("{}\n"));
    const notesProvider = createNotesProvider();
    const runtimeRegistry = new RuntimeNoteStateRegistry();
    const document = createDocument(
      path.join(workspaceRoot, ".caca/notes/index.json"),
      '{"updatedAt":"later"}\n',
    );

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(
      createExtensionContext(),
      notes.value,
      notesProvider.value,
      runtimeRegistry,
    );
    mocks.saveListeners[0]?.(document);
    mocks.changeListeners[0]?.(document.uri);
    mocks.deleteListeners[0]?.(document.uri);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(notes.saveSourceFile).not.toHaveBeenCalled();
    expect(mocks.openTextDocument).not.toHaveBeenCalled();
    expect(notesProvider.refreshCurrentNotes).not.toHaveBeenCalled();
    expect(runtimeRegistry.listStates({
      workspaceRoot,
      outputDirectory: ".caca",
    })).toEqual([]);
  });

  it("checks externally changed files after a debounce", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("external");
    const previousText = "export const value = 1;\n";
    const nextText = "export const value = 2;\n";
    const notes = createNotes(createStoredSourceFile(previousText));
    const notesProvider = createNotesProvider();
    const runtimeRegistry = new RuntimeNoteStateRegistry();
    const document = createDocument(path.join(workspaceRoot, "src/index.ts"), nextText);

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.openTextDocument.mockResolvedValue(document);
    registerNotesContentEvents(
      createExtensionContext(),
      notes.value,
      notesProvider.value,
      runtimeRegistry,
    );
    mocks.changeListeners[0]?.(document.uri);

    await vi.advanceTimersByTimeAsync(799);
    expect(notes.saveSourceFile).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(mocks.openTextDocument).toHaveBeenCalledWith(document.uri);
    expect(notes.saveSourceFile).not.toHaveBeenCalled();
    expect(
      runtimeRegistry.getState({
        workspaceRoot,
        outputDirectory: ".caca",
        relativePath: "src/index.ts",
      }),
    ).toEqual(
      expect.objectContaining({
        currentSourceHash: createSourceHash(nextText),
      }),
    );
    expect(notesProvider.refreshCurrentNotes).toHaveBeenCalledWith(document.uri);

    vi.useRealTimers();
  });

  it("debounces repeated external changes for the same file", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("debounced");
    const previousText = "export const value = 1;\n";
    const nextText = "export const value = 2;\n";
    const notes = createNotes(createStoredSourceFile(previousText));
    const runtimeRegistry = new RuntimeNoteStateRegistry();
    const document = createDocument(path.join(workspaceRoot, "src/index.ts"), nextText);

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.openTextDocument.mockResolvedValue(document);
    registerNotesContentEvents(
      createExtensionContext(),
      notes.value,
      undefined,
      runtimeRegistry,
    );
    mocks.changeListeners[0]?.(document.uri);
    await vi.advanceTimersByTimeAsync(400);
    mocks.changeListeners[0]?.(document.uri);
    await vi.advanceTimersByTimeAsync(799);

    expect(mocks.openTextDocument).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(mocks.openTextDocument).toHaveBeenCalledOnce();
    expect(notes.saveSourceFile).not.toHaveBeenCalled();
    expect(
      runtimeRegistry.getState({
        workspaceRoot,
        outputDirectory: ".caca",
        relativePath: "src/index.ts",
      }),
    ).toBeDefined();

    vi.useRealTimers();
  });

  it("stores binary watcher changes in Runtime State without persisting Notes", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("binary-external");
    const notes = createNotes(createStoredSourceFile("previous binary metadata"));
    const notesProvider = createNotesProvider();
    const runtimeRegistry = new RuntimeNoteStateRegistry();
    const uri = createUri(path.join(workspaceRoot, "assets/image.png"));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.openTextDocument.mockRejectedValue(
      new Error("File seems to be binary and cannot be opened as text"),
    );
    registerNotesContentEvents(
      createExtensionContext(),
      notes.value,
      notesProvider.value,
      runtimeRegistry,
    );
    mocks.changeListeners[0]?.(uri);

    await vi.advanceTimersByTimeAsync(800);

    expect(notes.saveSourceFile).not.toHaveBeenCalled();
    expect(
      runtimeRegistry.getState({
        workspaceRoot,
        outputDirectory: ".caca",
        relativePath: "assets/image.png",
      }),
    ).toEqual(
      expect.objectContaining({
        currentSourceHash: expect.stringMatching(/^metadata-sha256:/),
        issues: ["stale"],
      }),
    );
    expect(notesProvider.refreshCurrentNotes).toHaveBeenCalledWith(uri);
  });

  it("keeps the latest state when document and watcher events target the same file", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("shared-change-queue");
    const previousText = "export const value = 1;\n";
    const nextText = "export const value = 2;\n";
    const notes = createNotes(createStoredSourceFile(previousText));
    const runtimeRegistry = new RuntimeNoteStateRegistry();
    const document = createDocument(
      path.join(workspaceRoot, "src/index.ts"),
      nextText,
      true,
    );

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.openTextDocument.mockResolvedValue(document);
    registerNotesContentEvents(
      createExtensionContext(),
      notes.value,
      undefined,
      runtimeRegistry,
    );
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
    mocks.changeListeners[0]?.(document.uri);

    await vi.advanceTimersByTimeAsync(800);

    expect(notes.saveSourceFile).toHaveBeenCalledOnce();
    expect(mocks.openTextDocument).toHaveBeenCalledOnce();
    expect(
      runtimeRegistry.getState({
        workspaceRoot,
        outputDirectory: ".caca",
        relativePath: "src/index.ts",
      }),
    ).toBeUndefined();
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
    expect(notes.saveSourceFile).not.toHaveBeenCalled();
  });

  it("stores an external Watcher Delete as missing Runtime State without persisting Notes", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("external-delete");
    const sourceText = "export const value = 1;\n";
    const notes = createNotes(createStoredSourceFile(sourceText));
    const notesProvider = createNotesProvider();
    const runtimeRegistry = new RuntimeNoteStateRegistry();
    const uri = createUri(path.join(workspaceRoot, "src/index.ts"));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.fsStat.mockRejectedValue(
      Object.assign(new Error("File not found"), { code: "FileNotFound" }),
    );
    registerNotesContentEvents(
      createExtensionContext(),
      notes.value,
      notesProvider.value,
      runtimeRegistry,
    );
    mocks.deleteListeners[0]?.(uri);

    await vi.advanceTimersByTimeAsync(800);
    await vi.advanceTimersByTimeAsync(0);

    expect(runtimeRegistry.getState({
      workspaceRoot,
      outputDirectory: ".caca",
      relativePath: "src/index.ts",
    })).toMatchObject({
      issues: ["missing", "locationReview"],
      reason: "resourceMissing",
      targetChanges: [
        {
          kind: "file",
          status: {
            content: "current",
            anchor: "needsConfirmation",
          },
        },
      ],
    });
    expect(notes.saveSourceFile).not.toHaveBeenCalled();
    expect(notesProvider.refreshCurrentNotes).not.toHaveBeenCalled();
  });

  it("suppresses Watcher Delete after a deterministic VS Code deletion", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("suppressed-delete");
    const notes = createNotes(createStoredSourceFile("export const value = 1;\n"));
    const runtimeRegistry = new RuntimeNoteStateRegistry();
    const coordinator = new ChangeTaskCoordinator(800);
    const uri = createUri(path.join(workspaceRoot, "src/index.ts"));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(
      createExtensionContext(),
      notes.value,
      undefined,
      runtimeRegistry,
      undefined,
      coordinator,
    );
    mocks.deleteListeners[0]?.(uri);
    coordinator.markDeleted(uri);

    await vi.advanceTimersByTimeAsync(800);
    await vi.advanceTimersByTimeAsync(0);

    expect(runtimeRegistry.listStates({
      workspaceRoot,
      outputDirectory: ".caca",
    })).toEqual([]);
    coordinator.dispose();
  });

  it("persists and refreshes deterministic text changes without a debounce", async () => {
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

    await vi.advanceTimersByTimeAsync(0);
    expect(notes.saveSourceFile).toHaveBeenCalledOnce();
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
      { canPersist: expect.any(Function) },
    );
  });

  it("restores persisted relocation state across real Undo and Redo events", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("history-undo-redo");
    const previousText = "export const value = 1;\n";
    const enteredText = `\n${previousText}`;
    const notes = createNotes(createStoredSourceFile(previousText));
    const documentPath = path.join(workspaceRoot, "src/index.ts");

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(createExtensionContext(), notes.value);

    mocks.textDocumentChangeListeners[0]?.({
      document: createDocument(documentPath, enteredText, true),
      contentChanges: [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
          rangeLength: 0,
          text: "\n",
        },
      ],
    } as unknown as vscodeTypes.TextDocumentChangeEvent);
    await vi.advanceTimersByTimeAsync(0);

    expect(notes.saveSourceFile).toHaveBeenLastCalledWith(
      workspaceRoot,
      ".caca",
      "src/index.ts",
      expect.objectContaining({
        sectionNotes: [
          expect.objectContaining({
            range: { startLine: 1, endLine: 2 },
          }),
        ],
      }),
      expect.any(String),
      { canPersist: expect.any(Function) },
    );

    mocks.textDocumentChangeListeners[0]?.({
      document: createDocument(documentPath, previousText, false),
      reason: 1,
      contentChanges: [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 1, character: 0 },
          },
          rangeLength: 1,
          text: "",
        },
      ],
    } as unknown as vscodeTypes.TextDocumentChangeEvent);
    await vi.advanceTimersByTimeAsync(0);

    expect(notes.saveSourceFile).toHaveBeenLastCalledWith(
      workspaceRoot,
      ".caca",
      "src/index.ts",
      expect.objectContaining({
        source: expect.objectContaining({
          sourceHash: createSourceHash(previousText),
        }),
        sectionNotes: [
          expect.objectContaining({
            range: { startLine: 1, endLine: 1 },
            status: { content: "current", anchor: "confirmed" },
          }),
        ],
      }),
      expect.any(String),
      { canPersist: expect.any(Function) },
    );

    mocks.textDocumentChangeListeners[0]?.({
      document: createDocument(documentPath, enteredText, true),
      reason: 2,
      contentChanges: [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
          rangeLength: 0,
          text: "\n",
        },
      ],
    } as unknown as vscodeTypes.TextDocumentChangeEvent);
    await vi.advanceTimersByTimeAsync(0);

    expect(notes.saveSourceFile).toHaveBeenCalledTimes(3);
    expect(notes.saveSourceFile).toHaveBeenLastCalledWith(
      workspaceRoot,
      ".caca",
      "src/index.ts",
      expect.objectContaining({
        source: expect.objectContaining({
          sourceHash: createSourceHash(enteredText),
        }),
        sectionNotes: [
          expect.objectContaining({
            range: { startLine: 1, endLine: 2 },
          }),
        ],
      }),
      expect.any(String),
      { canPersist: expect.any(Function) },
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
              startLine: 3,
              endLine: 3,
            },
          }),
        ],
      }),
      expect.any(String),
      { canPersist: expect.any(Function) },
    );
  });

  it("applies multiple deterministic changes from one VS Code event", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("multi-change-deterministic");
    const previousText = "export const value = 1;\n";
    const nextText = "const first = 1;\nconst second = 2;\nexport const value = 1;\n";
    const notes = createNotes(createStoredSourceFile(previousText));
    const notesProvider = createNotesProvider();
    const runtimeRegistry = new RuntimeNoteStateRegistry();
    const documentPath = path.join(workspaceRoot, "src/index.ts");

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    runtimeRegistry.setState({
      workspaceRoot,
      outputDirectory: ".caca",
      relativePath: "src/index.ts",
      currentSourceHash: createSourceHash(previousText),
      issues: ["locationReview"],
      reason: "anchorChanged",
      observedAt: "2026-07-12T00:00:00.000Z",
      targetChanges: [
        {
          kind: "section",
          noteId: "section:1",
          status: { content: "stale", anchor: "needsConfirmation" },
          range: { startLine: 2, endLine: 2 },
        },
      ],
    });
    registerNotesContentEvents(
      createExtensionContext(),
      notes.value,
      notesProvider.value,
      runtimeRegistry,
    );
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
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
            isEmpty: true,
          },
          rangeLength: 0,
          text: "const second = 2;\n",
        },
      ],
    } as unknown as vscodeTypes.TextDocumentChangeEvent);

    await vi.advanceTimersByTimeAsync(0);

    expect(notes.saveSourceFile).toHaveBeenCalledOnce();
    expect(notes.saveSourceFile).toHaveBeenLastCalledWith(
      workspaceRoot,
      ".caca",
      "src/index.ts",
      expect.objectContaining({
        sectionNotes: [
          expect.objectContaining({
            range: {
              startLine: 3,
              endLine: 3,
            },
            status: {
              content: "current",
              anchor: "confirmed",
            },
          }),
        ],
        lineNotes: [
          expect.objectContaining({
            line: 3,
            status: {
              content: "current",
              anchor: "confirmed",
            },
          }),
        ],
      }),
      expect.any(String),
      { canPersist: expect.any(Function) },
    );
    expect(
      runtimeRegistry.getState({
        workspaceRoot,
        outputDirectory: ".caca",
        relativePath: "src/index.ts",
      }),
    ).toBeUndefined();
    expect(notesProvider.refreshCurrentNotes).toHaveBeenCalledOnce();
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

  it("keeps unsupported dirty replacements in Runtime State after save", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("unsupported-save");
    const previousText = "export const value = 1;\n";
    const nextText = "export const value = 2;\n";
    const notes = createNotes(createStoredSourceFile(previousText));
    const document = createDocument(path.join(workspaceRoot, "src/index.ts"), nextText);
    const runtimeRegistry = new RuntimeNoteStateRegistry();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(
      createExtensionContext(),
      notes.value,
      undefined,
      runtimeRegistry,
    );
    mocks.textDocumentChangeListeners[0]?.({
      document,
      contentChanges: [],
    } as unknown as vscodeTypes.TextDocumentChangeEvent);
    mocks.saveListeners[0]?.(document);
    await vi.advanceTimersByTimeAsync(0);

    expect(notes.saveSourceFile).not.toHaveBeenCalled();
    expect(
      runtimeRegistry.getState({
        workspaceRoot,
        outputDirectory: ".caca",
        relativePath: "src/index.ts",
      }),
    ).toEqual(
      expect.objectContaining({
        currentSourceHash: createSourceHash(nextText),
        issues: expect.arrayContaining(["stale", "locationReview"]),
      }),
    );
  });

  it("refreshes Runtime State for non-dirty document replacements without persisting Notes", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await createTempWorkspaceRoot("non-dirty-change");
    const previousText = "export const value = 1;\n";
    const nextText = "export const value = 2;\n";
    const notes = createNotes(createStoredSourceFile(previousText));
    const runtimeRegistry = new RuntimeNoteStateRegistry();
    const document = createDocument(
      path.join(workspaceRoot, "src/index.ts"),
      nextText,
      false,
    );

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(
      createExtensionContext(),
      notes.value,
      undefined,
      runtimeRegistry,
    );
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

    expect(notes.saveSourceFile).not.toHaveBeenCalled();
    expect(
      runtimeRegistry.getState({
        workspaceRoot,
        outputDirectory: ".caca",
        relativePath: "src/index.ts",
      }),
    ).toEqual(
      expect.objectContaining({
        currentSourceHash: createSourceHash(nextText),
      }),
    );
  });

  it("invalidates cached Notes when the managed Store changes externally", async () => {
    vi.useFakeTimers();
    const workspaceRoot = await createTempWorkspaceRoot("managed-store-change");
    const notes = createNotes(createStoredSourceFile("export const value = 1;\n"));
    const notesProvider = createNotesProvider();
    const managedIndex = createDocument(
      path.join(workspaceRoot, ".caca/notes/index.json"),
      "{}",
      false,
    );

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(createExtensionContext(), notes.value, notesProvider.value);
    mocks.changeListeners[0]?.(managedIndex.uri);
    mocks.changeListeners[0]?.(managedIndex.uri);
    await vi.advanceTimersByTimeAsync(800);
    await vi.advanceTimersByTimeAsync(0);

    expect(notes.clearAllLocationCaches).toHaveBeenCalledWith(workspaceRoot, ".caca");
    expect(notesProvider.refreshAfterExternalNoteStoreChange).toHaveBeenCalledOnce();
    expect(notes.saveSourceFile).not.toHaveBeenCalled();
  });
});

function createNotes(sourceFile: StoredSourceFile | undefined): {
  value: WorkspaceNoteStore;
  saveSourceFile: ReturnType<typeof vi.fn>;
  clearAllLocationCaches: ReturnType<typeof vi.fn>;
} {
  let cachedSourceFile = sourceFile;
  const clearAllLocationCaches = vi.fn();
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
        clearAllLocationCaches,
      },
    } as unknown as WorkspaceNoteStore,
    saveSourceFile,
    clearAllLocationCaches,
  };
}

function createNotesProvider(): {
  value: NotesViewProvider;
  refreshCurrentNotes: ReturnType<typeof vi.fn>;
  refreshAfterExternalNoteStoreChange: ReturnType<typeof vi.fn>;
} {
  const refreshCurrentNotes = vi.fn().mockResolvedValue(undefined);
  const refreshAfterExternalNoteStoreChange = vi.fn().mockResolvedValue(undefined);

  return {
    value: {
      refreshCurrentNotes,
      refreshAfterExternalNoteStoreChange,
    } as unknown as NotesViewProvider,
    refreshCurrentNotes,
    refreshAfterExternalNoteStoreChange,
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

/**
 * Creates a minimal VS Code text document for content-event tests.
 *
 * @param fsPath - Absolute document path.
 * @param text - Current document text.
 * @param isDirty - Whether VS Code considers the document user-modified.
 * @returns Mock VS Code text document.
 */
function createDocument(
  fsPath: string,
  text: string,
  isDirty?: boolean,
): vscodeTypes.TextDocument {
  return {
    uri: createUri(fsPath),
    languageId: "typescript",
    isDirty,
    getText: () => text,
  } as vscodeTypes.TextDocument;
}

/**
 * Creates numbered source lines for relocation boundary tests.
 *
 * @param lineCount - Number of lines to create.
 * @param firstLine - One-based number assigned to the first line.
 * @returns Source text containing numbered lines.
 */
function createNumberedSourceLines(lineCount: number, firstLine = 1): string {
  return Array.from(
    { length: lineCount },
    (_, index) => `line ${firstLine + index}`,
  ).join("\n");
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
