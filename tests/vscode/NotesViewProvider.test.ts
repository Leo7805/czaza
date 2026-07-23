/**
 * Unit tests for notes payload delivery and selected-section highlighting.
 */

import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activeTextEditor: undefined as vscodeTypes.TextEditor | undefined,
  workspaceFolders: [] as vscodeTypes.WorkspaceFolder[],
  getResourceNotes: vi.fn(),
  getNavigatorNotes: vi.fn(),
  getStoredNavigatorFileNotes: vi.fn(),
  clearNoteStaleStatusService: vi.fn(),
  deleteNavigatorFileNotesService: vi.fn(),
  deleteNavigatorLineNoteService: vi.fn(),
  deleteNavigatorSectionNoteService: vi.fn(),
  markNavigatorFileNoteOrphanedService: vi.fn(),
  relocateNavigatorFileNoteService: vi.fn(),
  ensureFileNoteResourceAvailability: vi.fn(),
  postMessage: vi.fn().mockResolvedValue(true),
  setDecorations: vi.fn(),
  decorationDispose: vi.fn(),
  openTextDocument: vi.fn(),
  showTextDocument: vi.fn(),
  revealRange: vi.fn(),
  showErrorMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  executeCommand: vi.fn(),
  fsStat: vi.fn(),
  messageListeners: [] as Array<(message: unknown) => void>,
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue('<script src="./assets/index.js"></script>'),
}));

vi.mock("@vscode/services/getResourceNotesService", () => ({
  getResourceNotes: mocks.getResourceNotes,
}));

vi.mock("@vscode/services/getNavigatorNotesService", () => ({
  getNavigatorNotes: mocks.getNavigatorNotes,
}));

vi.mock("@vscode/services/getStoredNavigatorFileNotesService", () => ({
  getStoredNavigatorFileNotes: mocks.getStoredNavigatorFileNotes,
}));

vi.mock("@vscode/services/ensureFileNoteResourceAvailabilityService", () => ({
  ensureFileNoteResourceAvailability: mocks.ensureFileNoteResourceAvailability,
}));

vi.mock("@vscode/services/clearNoteStaleStatusService", () => ({
  clearNoteStaleStatusService: mocks.clearNoteStaleStatusService,
}));

vi.mock("@vscode/services/deleteNavigatorFileNotesService", () => ({
  deleteNavigatorFileNotesService: mocks.deleteNavigatorFileNotesService,
}));

vi.mock("@vscode/services/deleteNavigatorLineNoteService", () => ({
  deleteNavigatorLineNoteService: mocks.deleteNavigatorLineNoteService,
}));

vi.mock("@vscode/services/deleteNavigatorSectionNoteService", () => ({
  deleteNavigatorSectionNoteService: mocks.deleteNavigatorSectionNoteService,
}));

vi.mock("@vscode/services/markNavigatorFileNoteOrphanedService", () => ({
  markNavigatorFileNoteOrphanedService: mocks.markNavigatorFileNoteOrphanedService,
}));

vi.mock("@vscode/services/relocateNavigatorFileNoteService", () => ({
  relocateNavigatorFileNoteService: mocks.relocateNavigatorFileNoteService,
}));

vi.mock("vscode", () => ({
  Position: class MockPosition {
    readonly line: number;
    readonly character: number;

    constructor(line: number, character: number) {
      this.line = line;
      this.character = character;
    }
  },

  Range: class MockRange {
    readonly startLine: number;
    readonly startCharacter: number;
    readonly endLine: number;
    readonly endCharacter: number;

    constructor(
      startLineOrPosition: number | { line: number; character: number },
      startCharacterOrPosition: number | { line: number; character: number },
      endLine?: number,
      endCharacter?: number,
    ) {
      if (typeof startLineOrPosition === "number") {
        this.startLine = startLineOrPosition;
        this.startCharacter = startCharacterOrPosition as number;
        this.endLine = endLine ?? startLineOrPosition;
        this.endCharacter = endCharacter ?? (startCharacterOrPosition as number);
        return;
      }

      const endPosition = startCharacterOrPosition as { line: number; character: number };
      this.startLine = startLineOrPosition.line;
      this.startCharacter = startLineOrPosition.character;
      this.endLine = endPosition.line;
      this.endCharacter = endPosition.character;
    }
  },

  Selection: class MockSelection {
    readonly active: { line: number; character: number };

    constructor(
      _anchor: { line: number; character: number },
      active: { line: number; character: number },
    ) {
      this.active = active;
    }
  },

  TextEditorRevealType: {
    InCenter: 2,
  },

  FileType: {
    File: 1,
    Directory: 2,
  },

  Uri: {
    file: (fsPath: string) => ({
      scheme: "file",
      fsPath,
      toString: () => `file://${fsPath}`,
    }),
    joinPath: (base: vscodeTypes.Uri, ...parts: string[]) => ({
      scheme: "file",
      fsPath: [base.fsPath, ...parts].join("/"),
      toString: () => `file://${[base.fsPath, ...parts].join("/")}`,
    }),
  },

  workspace: {
    get workspaceFolders() {
      return mocks.workspaceFolders;
    },
    getConfiguration: () => ({
      get: <T>(_key: string, defaultValue: T): T => defaultValue,
    }),
    getWorkspaceFolder: (uri: vscodeTypes.Uri) =>
      mocks.workspaceFolders.find((folder) => {
        const relativePath = uri.fsPath.startsWith(folder.uri.fsPath)
          ? uri.fsPath.slice(folder.uri.fsPath.length)
          : "../outside";
        return !relativePath.startsWith("../");
      }),
    fs: {
      stat: mocks.fsStat,
    },
    openTextDocument: mocks.openTextDocument,
  },

  commands: {
    executeCommand: mocks.executeCommand,
  },

  window: {
    get activeTextEditor() {
      return mocks.activeTextEditor;
    },

    createTextEditorDecorationType: () => ({
      dispose: mocks.decorationDispose,
    }),
    showTextDocument: mocks.showTextDocument,
    showErrorMessage: mocks.showErrorMessage,
    showWarningMessage: mocks.showWarningMessage,
  },
}));

import { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";
import {
  AllNotesBatchRequiredError,
  AllNotesLineLimitError,
} from "@vscode/services/generateAllNotesService";

describe("NotesViewProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clearNoteStaleStatusService.mockReset();
    mocks.deleteNavigatorFileNotesService.mockReset();
    mocks.deleteNavigatorLineNoteService.mockReset();
    mocks.deleteNavigatorSectionNoteService.mockReset();
    mocks.getStoredNavigatorFileNotes.mockReset();
    mocks.markNavigatorFileNoteOrphanedService.mockReset();
    mocks.relocateNavigatorFileNoteService.mockReset();
    mocks.ensureFileNoteResourceAvailability.mockReset();
    mocks.getNavigatorNotes.mockReset();
    mocks.fsStat.mockReset();
    mocks.executeCommand.mockReset();
    mocks.showErrorMessage.mockReset();
    mocks.workspaceFolders.length = 0;
    mocks.messageListeners.length = 0;
    mocks.activeTextEditor = undefined;
  });

  it("switches section highlight while the webview owns focus", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.activeTextEditor = createEditor(uri);
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      sectionNotes: [
        {
          id: "section:first",
          title: "Outer",
          startLine: 10,
          endLine: 20,
        },
        {
          id: "section:second",
          title: "Inner",
          startLine: 12,
          endLine: 15,
        },
      ],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 12);

    expect(mocks.postMessage).toHaveBeenCalledWith({
      type: "resourceNotes",
      payload: expect.objectContaining({ kind: "file" }),
    });
    expect(getLastDecorationRange()).toEqual({
      startLine: 9,
      startCharacter: 0,
      endLine: 19,
      endCharacter: 20,
    });

    // Interacting with a Webview can temporarily clear VS Code's activeTextEditor.
    mocks.activeTextEditor = undefined;

    mocks.messageListeners[0]?.({
      type: "selectSection",
      sectionId: "section:second",
    });

    expect(getLastDecorationRange()).toEqual({
      startLine: 11,
      startCharacter: 0,
      endLine: 14,
      endCharacter: 15,
    });

    provider.dispose();
  });

  it("reveals a navigator section and refreshes notes for its first line", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();
    const editor = createEditor(uri);

    mocks.activeTextEditor = editor;
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      sectionNotes: [
        {
          id: "section:first",
          title: "Outer",
          startLine: 10,
          endLine: 20,
        },
        {
          id: "section:second",
          title: "Inner",
          startLine: 12,
          endLine: 15,
        },
      ],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 10);
    mocks.messageListeners[0]?.({
      type: "openNavigatorSection",
      sectionId: "section:second",
      startLine: 12,
      endLine: 15,
    });

    await vi.waitFor(() => expect(mocks.getResourceNotes).toHaveBeenCalledTimes(2));
    expect(mocks.getResourceNotes).toHaveBeenLastCalledWith({
      uri,
      notes: {},
      activeLine: 12,
    });
    expect(editor.selection.active).toEqual({ line: 11, character: 0 });
    expect(mocks.revealRange).toHaveBeenCalledWith(
      expect.objectContaining({ startLine: 11, endLine: 11 }),
      2,
    );
    await vi.waitFor(() =>
      expect(getLastDecorationRange()).toEqual({
        startLine: 11,
        startCharacter: 0,
        endLine: 14,
        endCharacter: 15,
      }),
    );

    provider.dispose();
  });

  it("reveals a navigator line and refreshes notes for that line", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();
    const editor = createEditor(uri);

    mocks.activeTextEditor = editor;
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      activeLine: 24,
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 12);
    mocks.messageListeners[0]?.({
      type: "openNavigatorLine",
      line: 24,
    });

    await vi.waitFor(() => expect(mocks.getResourceNotes).toHaveBeenCalledTimes(2));
    expect(mocks.getResourceNotes).toHaveBeenLastCalledWith({
      uri,
      notes: {},
      activeLine: 24,
    });
    expect(editor.selection.active).toEqual({ line: 23, character: 0 });
    expect(mocks.revealRange).toHaveBeenCalledWith(
      expect.objectContaining({ startLine: 23, endLine: 23 }),
      2,
    );

    provider.dispose();
  });

  it("shows a webview notice instead of opening a missing navigator resource", async () => {
    const workspaceRoot = "/tmp";
    const uri = createUri(`${workspaceRoot}/current.ts`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.ensureFileNoteResourceAvailability.mockResolvedValue({
      available: false,
      changed: true,
    });
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "current.ts",
      relativePath: "current.ts",
      aiAction: "generate",
      sectionNotes: [],
    });
    mocks.getNavigatorNotes.mockResolvedValue({
      kind: "resource",
      projectRootName: "tmp",
      currentFile: "current.ts",
      files: [
        {
          name: "missing.ts",
          relativePath: "src/missing.ts",
          resourceKind: "file",
          preview: "Missing file note.",
          status: {
            content: "stale",
            anchor: "needsConfirmation",
          },
        },
      ],
      sections: [],
      lines: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 1);
    mocks.messageListeners[0]?.({
      type: "openNavigatorResource",
      relativePath: "src/missing.ts",
    });

    await vi.waitFor(() => expect(mocks.ensureFileNoteResourceAvailability).toHaveBeenCalledOnce());
    expect(mocks.openTextDocument).not.toHaveBeenCalled();
    expect(mocks.showTextDocument).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(mocks.postMessage).toHaveBeenCalledWith({
        type: "notice",
        notice: {
          tone: "error",
          title: "Note Target Not Found",
          message: "src/missing.ts could not be opened. It may have been renamed, moved, or deleted outside VS Code.",
          actions: [
            {
              label: "Close",
              variant: "primary",
            },
          ],
        },
      }),
    );

    provider.dispose();
  });

  it("reveals a Navigator directory resource in Explorer instead of opening notes", async () => {
    const workspaceRoot = "/tmp";
    const uri = createUri(`${workspaceRoot}/current.ts`);
    const directoryUri = createUri(`${workspaceRoot}/src`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.ensureFileNoteResourceAvailability.mockResolvedValue({
      available: true,
      changed: false,
    });
    mocks.fsStat.mockResolvedValue({ type: 2 });
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "current.ts",
      relativePath: "current.ts",
      aiAction: "generate",
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 1);
    mocks.messageListeners[0]?.({
      type: "openNavigatorResource",
      relativePath: "src",
    });

    await vi.waitFor(() =>
      expect(mocks.executeCommand).toHaveBeenCalledWith(
        "revealInExplorer",
        expect.objectContaining({ fsPath: directoryUri.fsPath }),
      ),
    );
    expect(mocks.openTextDocument).not.toHaveBeenCalled();
    expect(mocks.getResourceNotes).toHaveBeenCalledTimes(1);

    provider.dispose();
  });

  it("opens a binary Navigator resource with the default VS Code editor", async () => {
    const workspaceRoot = "/tmp";
    const uri = createUri(`${workspaceRoot}/current.ts`);
    const binaryUri = createUri(`${workspaceRoot}/dist/czaza-0.5.1.vsix`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.ensureFileNoteResourceAvailability.mockResolvedValue({
      available: true,
      changed: false,
    });
    mocks.fsStat.mockResolvedValue({ type: 1 });
    mocks.openTextDocument.mockRejectedValueOnce(
      new Error("File seems to be binary and cannot be opened as text"),
    );
    mocks.getResourceNotes
      .mockResolvedValueOnce({
        kind: "file",
        name: "current.ts",
        relativePath: "current.ts",
        aiAction: "generate",
        sectionNotes: [],
      })
      .mockResolvedValueOnce({
        kind: "binary",
        name: "czaza-0.5.1.vsix",
        relativePath: "dist/czaza-0.5.1.vsix",
        aiAction: "generate",
      });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 1);
    mocks.messageListeners[0]?.({
      type: "openNavigatorResource",
      relativePath: "dist/czaza-0.5.1.vsix",
    });

    await vi.waitFor(() => expect(mocks.getResourceNotes).toHaveBeenCalledTimes(2));
    expect(mocks.showTextDocument).not.toHaveBeenCalled();
    expect(mocks.executeCommand).toHaveBeenCalledWith(
      "revealInExplorer",
      expect.objectContaining({ fsPath: binaryUri.fsPath }),
    );
    expect(mocks.executeCommand).toHaveBeenCalledWith(
      "vscode.open",
      expect.objectContaining({ fsPath: binaryUri.fsPath }),
      { preview: false },
    );
    expect(mocks.getResourceNotes).toHaveBeenLastCalledWith({
      uri: expect.objectContaining({ fsPath: binaryUri.fsPath }),
      notes: {},
    });
    expect(mocks.showErrorMessage).not.toHaveBeenCalled();

    provider.dispose();
  });

  it("runs file note generation once and refreshes the current payload", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const generateFileNotes = vi.fn().mockResolvedValue(true);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      generateFileNotes,
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 1);
    mocks.messageListeners[0]?.({ type: "generateFileNotes" });
    await vi.waitFor(() => expect(generateFileNotes).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.getResourceNotes).toHaveBeenCalledTimes(2));

    expect(generateFileNotes).toHaveBeenCalledWith(uri);
    expect(mocks.postMessage).toHaveBeenCalledWith({
      type: "resourceNotes",
      payload: expect.objectContaining({
        kind: "file",
        isAiActionRunning: true,
      }),
    });
    expect(mocks.postMessage).toHaveBeenLastCalledWith({
      type: "resourceNotes",
      payload: expect.objectContaining({
        kind: "file",
        isAiActionRunning: false,
        revealAiNotes: "fileSection",
      }),
    });

    provider.dispose();
  });

  it("runs All Notes generation and reveals all three AI note levels", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const generateAllNotes = vi.fn().mockResolvedValue(true);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
      generateAllNotes,
    );
    const view = createWebviewView();

    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 1);
    mocks.messageListeners[0]?.({ type: "generateAllNotes" });
    await vi.waitFor(() => expect(generateAllNotes).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.getResourceNotes).toHaveBeenCalledTimes(2));

    expect(mocks.showWarningMessage).not.toHaveBeenCalled();
    expect(generateAllNotes).toHaveBeenCalledWith(uri, {
      onProgress: expect.any(Function),
    });
    expect(mocks.postMessage).toHaveBeenLastCalledWith({
      type: "resourceNotes",
      payload: expect.objectContaining({
        kind: "file",
        isAiActionRunning: false,
        revealAiNotes: "all",
      }),
    });

    provider.dispose();
  });

  it("shows the custom notice and opens settings when All Notes exceeds the line limit", async () => {
    const uri = createUri("/workspace/src/large.ts");
    const generateAllNotes = vi.fn().mockRejectedValue(
      new AllNotesLineLimitError(520, 347, 300),
    );
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
      generateAllNotes,
    );
    const view = createWebviewView();

    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "large.ts",
      relativePath: "src/large.ts",
      aiAction: "generate",
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 1);
    mocks.messageListeners[0]?.({ type: "generateAllNotes" });

    await vi.waitFor(() =>
      expect(mocks.postMessage).toHaveBeenCalledWith({
        type: "notice",
        notice: {
          tone: "warning",
          title: "AI Analysis Line Limit Exceeded",
          message: expect.stringContaining("347 require AI analysis"),
          actions: [
            {
              label: "Open Settings",
              variant: "primary",
              action: "openMaxAnalysisLinesSetting",
            },
            { label: "Close", variant: "secondary" },
          ],
        },
      }),
    );
    expect(mocks.showErrorMessage).not.toHaveBeenCalled();

    mocks.messageListeners[0]?.({
      type: "runNoticeAction",
      action: "openMaxAnalysisLinesSetting",
    });
    expect(mocks.executeCommand).toHaveBeenCalledWith(
      "workbench.action.openSettings",
      "@id:czaza.ai.maxAnalysisLines",
    );

    provider.dispose();
  });

  it("confirms and reruns All Notes when safe generation requires batches", async () => {
    const uri = createUri("/workspace/src/large.ts");
    const generateAllNotes = vi
      .fn()
      .mockRejectedValueOnce(new AllNotesBatchRequiredError(1_500, 1_200, 2, 192_000))
      .mockResolvedValueOnce(true);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
      generateAllNotes,
    );
    const view = createWebviewView();

    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "large.ts",
      relativePath: "src/large.ts",
      aiAction: "generate",
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 1);
    mocks.messageListeners[0]?.({ type: "generateAllNotes" });

    await vi.waitFor(() =>
      expect(mocks.postMessage).toHaveBeenCalledWith({
        type: "notice",
        notice: expect.objectContaining({
          title: "Batch AI Analysis Required",
          message: expect.stringContaining("2 sequential batches"),
          actions: [
            {
              label: "Continue",
              variant: "primary",
              action: "confirmBatchedAllNotes",
            },
            { label: "Cancel", variant: "secondary" },
          ],
        }),
      }),
    );

    mocks.messageListeners[0]?.({
      type: "runNoticeAction",
      action: "confirmBatchedAllNotes",
    });
    await vi.waitFor(() => expect(generateAllNotes).toHaveBeenCalledTimes(2));
    expect(generateAllNotes).toHaveBeenNthCalledWith(1, uri, {
      onProgress: expect.any(Function),
    });
    expect(generateAllNotes).toHaveBeenNthCalledWith(2, uri, {
      allowBatching: true,
      onProgress: expect.any(Function),
    });

    provider.dispose();
  });

  it("runs line note generation for the active line and reveals the line AI tab", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const generateLineNote = vi.fn().mockResolvedValue(true);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
      undefined,
      generateLineNote,
    );
    const view = createWebviewView();

    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      activeLine: 12,
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 12);
    mocks.messageListeners[0]?.({ type: "generateLineNote", lineScope: "currentLine" });

    await vi.waitFor(() => expect(generateLineNote).toHaveBeenCalledOnce());
    expect(generateLineNote).toHaveBeenCalledWith(uri, 12);
    await vi.waitFor(() => expect(mocks.getResourceNotes).toHaveBeenCalledTimes(2));
    expect(mocks.postMessage).toHaveBeenLastCalledWith({
      type: "resourceNotes",
      payload: expect.objectContaining({
        kind: "file",
        isAiActionRunning: false,
        revealAiNotes: "line",
      }),
    });

    provider.dispose();
  });

  it("runs selected section generation and reveals only the section AI tab", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const generateSectionNote = vi.fn().mockResolvedValue(true);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
      undefined,
      undefined,
      generateSectionNote,
    );
    const view = createWebviewView();

    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "regenerate",
      sectionNotes: [
        {
          id: "section:run:1-3",
          title: "Run function",
          startLine: 1,
          endLine: 3,
        },
      ],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 1);
    mocks.messageListeners[0]?.({
      type: "generateSectionNote",
      sectionId: "section:run:1-3",
    });

    await vi.waitFor(() => expect(generateSectionNote).toHaveBeenCalledOnce());
    expect(generateSectionNote).toHaveBeenCalledWith(uri, "section:run:1-3");
    await vi.waitFor(() => expect(mocks.getResourceNotes).toHaveBeenCalledTimes(2));
    expect(mocks.postMessage).toHaveBeenLastCalledWith({
      type: "resourceNotes",
      payload: expect.objectContaining({
        kind: "file",
        isAiActionRunning: false,
        revealAiNotes: "section",
      }),
    });

    provider.dispose();
  });

  it("saves one typed user-note target and refreshes the current file", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const saveUserNote = vi.fn().mockResolvedValue(undefined);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      saveUserNote,
    );
    const view = createWebviewView();

    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      activeLine: 12,
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 12);
    mocks.messageListeners[0]?.({
      type: "saveUserNote",
      target: { level: "line", line: 12 },
      userNote: "Review this line.",
    });

    await vi.waitFor(() => expect(saveUserNote).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.getResourceNotes).toHaveBeenCalledTimes(2));
    expect(saveUserNote).toHaveBeenCalledWith(
      uri,
      { level: "line", line: 12 },
      "Review this line.",
    );

    provider.dispose();
  });

  it("saves a directory file note without enabling AI generation", async () => {
    const uri = createUri("/workspace/src");
    const generateFileNotes = vi.fn().mockResolvedValue(true);
    const saveUserNote = vi.fn().mockResolvedValue(undefined);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      generateFileNotes,
      saveUserNote,
    );
    const view = createWebviewView();

    mocks.getResourceNotes.mockResolvedValue({
      kind: "directory",
      name: "src",
      relativePath: "src",
      children: [],
    });

    await provider.resolveWebviewView(view);
    provider.postViewMode("navigator");
    mocks.postMessage.mockClear();
    mocks.executeCommand.mockClear();
    await provider.showResourceNotes(uri);
    expect(mocks.executeCommand).toHaveBeenCalledWith("setContext", "czaza.notesViewMode", "detail");
    expect(mocks.postMessage).toHaveBeenCalledWith({ type: "notesViewMode", mode: "detail" });
    mocks.messageListeners[0]?.({
      type: "saveUserNote",
      target: { level: "file" },
      userNote: "Directory overview.",
    });

    await vi.waitFor(() => expect(saveUserNote).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.getResourceNotes).toHaveBeenCalledTimes(2));
    expect(saveUserNote).toHaveBeenCalledWith(
      uri,
      { level: "file" },
      "Directory overview.",
    );

    mocks.messageListeners[0]?.({ type: "generateFileNotes" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(generateFileNotes).not.toHaveBeenCalled();

    provider.dispose();
  });

  it("refreshes the currently tracked resource notes after store changes", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.activeTextEditor = createEditor(uri);
    mocks.getResourceNotes
      .mockResolvedValueOnce({
        kind: "file",
        name: "index.ts",
        relativePath: "src/index.ts",
        aiAction: "generate",
        sectionNotes: [],
      })
      .mockResolvedValueOnce({
        kind: "file",
        name: "index.ts",
        relativePath: "src/index.ts",
        fileNote: {
          userNote: "Needs review.",
          status: {
            content: "stale",
            anchor: "confirmed",
          },
        },
        aiAction: "generate",
        sectionNotes: [],
      });

    await provider.resolveWebviewView(view);
    await provider.showResourceNotes(uri);
    await provider.refreshCurrentNotes();

    expect(mocks.getResourceNotes).toHaveBeenCalledTimes(2);
    expect(mocks.postMessage).toHaveBeenLastCalledWith({
      type: "resourceNotes",
      payload: expect.objectContaining({
        fileNote: expect.objectContaining({
          status: {
            content: "stale",
            anchor: "confirmed",
          },
        }),
      }),
    });

    provider.dispose();
  });

  it("refreshes a moved current resource from its new URI", async () => {
    const oldUri = createUri("/workspace/src/old.ts");
    const newUri = createUri("/workspace/src/new.ts");
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.activeTextEditor = createEditor(newUri);
    mocks.getResourceNotes
      .mockResolvedValueOnce({
        kind: "file",
        name: "old.ts",
        relativePath: "src/old.ts",
        aiAction: "generate",
        sectionNotes: [],
      })
      .mockResolvedValueOnce({
        kind: "file",
        name: "new.ts",
        relativePath: "src/new.ts",
        aiAction: "generate",
        sectionNotes: [],
      });

    await provider.resolveWebviewView(view);
    await provider.showResourceNotes(oldUri);
    await provider.refreshAfterResourceMove(oldUri, newUri);

    expect(mocks.getResourceNotes).toHaveBeenLastCalledWith({
      uri: newUri,
      notes: {},
      activeLine: 12,
    });

    provider.dispose();
  });

  it("resolves stale note content from a webview context-menu action", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.clearNoteStaleStatusService.mockResolvedValue(true);
    mocks.activeTextEditor = createEditor(uri);
    mocks.getResourceNotes
      .mockResolvedValueOnce({
        kind: "file",
        name: "index.ts",
        relativePath: "src/index.ts",
        fileNote: {
          userNote: "Needs review.",
          status: {
            content: "stale",
            anchor: "confirmed",
          },
        },
        aiAction: "generate",
        sectionNotes: [],
      })
      .mockResolvedValueOnce({
        kind: "file",
        name: "index.ts",
        relativePath: "src/index.ts",
        fileNote: {
          userNote: "Needs review.",
          status: {
            content: "current",
            anchor: "confirmed",
          },
        },
        aiAction: "generate",
        sectionNotes: [],
      });

    await provider.resolveWebviewView(view);
    await provider.showResourceNotes(uri);
    mocks.messageListeners[0]?.({
      type: "clearNoteStaleStatus",
      target: { level: "file" },
    });

    await vi.waitFor(() => expect(mocks.clearNoteStaleStatusService).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.getResourceNotes).toHaveBeenCalledTimes(2));
    expect(mocks.clearNoteStaleStatusService).toHaveBeenCalledWith({
      uri,
      notes: {},
      target: { level: "file" },
    });

    provider.dispose();
  });

  it("resolves stale content for a Navigator file item and refreshes Navigator notes", async () => {
    const workspaceRoot = "/tmp";
    const uri = createUri(`${workspaceRoot}/current.ts`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.clearNoteStaleStatusService.mockResolvedValue(true);
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "current.ts",
      relativePath: "current.ts",
      aiAction: "generate",
      sectionNotes: [],
    });
    mocks.getNavigatorNotes.mockResolvedValue({
      kind: "resource",
      projectRootName: "tmp",
      currentFile: "current.ts",
      files: [
        {
          name: "missing.ts",
          relativePath: "src/missing.ts",
          resourceKind: "file",
          preview: "Missing file note.",
          status: {
            content: "current",
            anchor: "needsConfirmation",
          },
        },
      ],
      sections: [],
      lines: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 1);
    mocks.messageListeners[0]?.({
      type: "clearNavigatorFileStaleStatus",
      relativePath: "src/missing.ts",
    });

    await vi.waitFor(() => expect(mocks.clearNoteStaleStatusService).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.getNavigatorNotes).toHaveBeenCalledOnce());
    expect(mocks.clearNoteStaleStatusService).toHaveBeenCalledWith({
      uri: expect.objectContaining({ fsPath: `${workspaceRoot}/src/missing.ts` }),
      notes: {},
      target: { level: "file" },
    });
    expect(mocks.postMessage).toHaveBeenCalledWith({
      type: "navigatorNotes",
      payload: expect.objectContaining({
        files: [
          expect.objectContaining({
            status: {
              content: "current",
              anchor: "needsConfirmation",
            },
          }),
        ],
      }),
    });

    provider.dispose();
  });

  it("relocates a Navigator file note, refreshes the list, closes the modal, and opens the target", async () => {
    const workspaceRoot = "/tmp";
    const currentUri = createUri(`${workspaceRoot}/current.ts`);
    const targetUri = createUri(`${workspaceRoot}/src/new.ts`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.relocateNavigatorFileNoteService.mockResolvedValue({
      previousRelativePath: "src/old.ts",
      nextRelativePath: "src/new.ts",
      targetUri,
    });
    mocks.openTextDocument.mockResolvedValue({ uri: targetUri });
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "new.ts",
      relativePath: "src/new.ts",
      aiAction: "generate",
      sectionNotes: [],
    });
    mocks.getNavigatorNotes.mockResolvedValue({
      kind: "resource",
      projectRootName: "tmp",
      currentFile: "src/new.ts",
      files: [
        {
          name: "new.ts",
          relativePath: "src/new.ts",
          resourceKind: "file",
          preview: "Relocated file note.",
          status: {
            content: "current",
            anchor: "confirmed",
          },
        },
      ],
      sections: [],
      lines: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(currentUri, 1);
    mocks.messageListeners[0]?.({
      type: "relocateNavigatorFileNote",
      fromRelativePath: "src/old.ts",
      toRelativePath: "src/new.ts",
    });

    await vi.waitFor(() => expect(mocks.relocateNavigatorFileNoteService).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(mocks.postMessage).toHaveBeenCalledWith({
        type: "navigatorFileNoteRelocated",
        fromRelativePath: "src/old.ts",
        toRelativePath: "src/new.ts",
      }),
    );
    expect(mocks.relocateNavigatorFileNoteService).toHaveBeenCalledWith({
      currentUri,
      notes: {},
      fromRelativePath: "src/old.ts",
      toRelativePath: "src/new.ts",
    });
    expect(mocks.getNavigatorNotes).toHaveBeenCalledWith({
      uri: currentUri,
      notes: {},
      selectedSectionId: undefined,
      activeLine: undefined,
    });
    expect(mocks.openTextDocument).toHaveBeenCalledWith(targetUri);
    expect(mocks.showTextDocument).toHaveBeenCalledWith({ uri: targetUri }, { preview: false });
    expect(mocks.getResourceNotes).toHaveBeenLastCalledWith({
      uri: targetUri,
      notes: {},
    });

    provider.dispose();
  });

  it("views non-orphaned Navigator file notes by opening the source file", async () => {
    const workspaceRoot = "/tmp";
    const currentUri = createUri(`${workspaceRoot}/current.ts`);
    const targetUri = createUri(`${workspaceRoot}/src/index.ts`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.ensureFileNoteResourceAvailability.mockResolvedValue({
      available: true,
      changed: false,
    });
    mocks.fsStat.mockResolvedValue({ type: 1 });
    mocks.openTextDocument.mockResolvedValue({ uri: targetUri });
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(currentUri, 1);
    mocks.messageListeners[0]?.({
      type: "viewNavigatorFileNotes",
      relativePath: "src/index.ts",
      anchor: "confirmed",
    });

    await vi.waitFor(() =>
      expect(mocks.openTextDocument).toHaveBeenCalledWith(
        expect.objectContaining({ fsPath: targetUri.fsPath }),
      ),
    );
    expect(mocks.getStoredNavigatorFileNotes).not.toHaveBeenCalled();
    expect(mocks.showTextDocument).toHaveBeenCalledWith({ uri: targetUri }, { preview: false });
    expect(mocks.executeCommand).toHaveBeenCalledWith("setContext", "czaza.notesViewMode", "detail");
    expect(mocks.postMessage).toHaveBeenCalledWith({ type: "notesViewMode", mode: "detail" });

    provider.dispose();
  });

  it("views non-orphaned Navigator directory notes without revealing Explorer", async () => {
    const workspaceRoot = "/tmp";
    const currentUri = createUri(`${workspaceRoot}/current.ts`);
    const directoryUri = createUri(`${workspaceRoot}/src`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.ensureFileNoteResourceAvailability.mockResolvedValue({
      available: true,
      changed: false,
    });
    mocks.fsStat.mockResolvedValue({ type: 2 });
    mocks.getResourceNotes
      .mockResolvedValueOnce({
        kind: "file",
        name: "current.ts",
        relativePath: "current.ts",
        aiAction: "generate",
        sectionNotes: [],
      })
      .mockResolvedValueOnce({
        kind: "directory",
        name: "src",
        relativePath: "src",
        children: [],
      });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(currentUri, 1);
    mocks.messageListeners[0]?.({
      type: "viewNavigatorFileNotes",
      relativePath: "src",
      anchor: "confirmed",
    });

    await vi.waitFor(() => expect(mocks.getResourceNotes).toHaveBeenCalledTimes(2));
    expect(mocks.executeCommand).not.toHaveBeenCalledWith(
      "revealInExplorer",
      expect.objectContaining({ fsPath: directoryUri.fsPath }),
    );
    expect(mocks.openTextDocument).not.toHaveBeenCalled();
    expect(mocks.getResourceNotes).toHaveBeenLastCalledWith({
      uri: expect.objectContaining({ fsPath: directoryUri.fsPath }),
      notes: {},
    });
    expect(mocks.postMessage).toHaveBeenCalledWith({ type: "notesViewMode", mode: "detail" });

    provider.dispose();
  });

  it("views orphaned Navigator file notes without opening a source file", async () => {
    const workspaceRoot = "/tmp";
    const currentUri = createUri(`${workspaceRoot}/current.ts`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "current.ts",
      relativePath: "current.ts",
      aiAction: "generate",
      sectionNotes: [],
    });
    mocks.getStoredNavigatorFileNotes.mockResolvedValue({
      kind: "file",
      name: "missing.ts",
      relativePath: "src/missing.ts",
      fileNote: {
        userNote: "Orphaned note.",
        status: {
          content: "current",
          anchor: "orphaned",
        },
      },
      aiAction: "generate",
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(currentUri, 1);
    mocks.messageListeners[0]?.({
      type: "viewNavigatorFileNotes",
      relativePath: "src/missing.ts",
      anchor: "orphaned",
    });

    await vi.waitFor(() => expect(mocks.getStoredNavigatorFileNotes).toHaveBeenCalledOnce());
    expect(mocks.openTextDocument).not.toHaveBeenCalled();
    expect(mocks.showTextDocument).not.toHaveBeenCalled();
    expect(mocks.getStoredNavigatorFileNotes).toHaveBeenCalledWith({
      currentUri,
      notes: {},
      relativePath: "src/missing.ts",
    });
    expect(mocks.executeCommand).toHaveBeenCalledWith("setContext", "czaza.notesViewMode", "detail");
    expect(mocks.postMessage).toHaveBeenCalledWith({ type: "notesViewMode", mode: "detail" });
    expect(mocks.postMessage).toHaveBeenCalledWith({
      type: "resourceNotes",
      payload: expect.objectContaining({
        kind: "file",
        relativePath: "src/missing.ts",
      }),
    });

    provider.dispose();
  });

  it("posts later active editor relative paths while Navigator file relocation is open", async () => {
    const workspaceRoot = "/tmp";
    const targetUri = createUri(`${workspaceRoot}/src/target.ts`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "target.ts",
      relativePath: "src/target.ts",
      aiAction: "generate",
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    mocks.messageListeners[0]?.({ type: "startNavigatorFileRelocatePathSync" });
    expect(mocks.postMessage).not.toHaveBeenCalledWith({
      type: "navigatorRelocateTargetPath",
      relativePath: "src/target.ts",
    });

    mocks.activeTextEditor = createEditor(targetUri);
    await provider.showActiveDocumentNotes(targetUri, 1);
    await vi.waitFor(() =>
      expect(mocks.postMessage).toHaveBeenCalledWith({
        type: "navigatorRelocateTargetPath",
        relativePath: "src/target.ts",
      }),
    );

    provider.dispose();
  });

  it("marks a Navigator file note orphaned and refreshes Navigator notes", async () => {
    const workspaceRoot = "/tmp";
    const uri = createUri(`${workspaceRoot}/current.ts`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.markNavigatorFileNoteOrphanedService.mockResolvedValue(true);
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "current.ts",
      relativePath: "current.ts",
      aiAction: "generate",
      sectionNotes: [],
    });
    mocks.getNavigatorNotes.mockResolvedValue({
      kind: "resource",
      projectRootName: "tmp",
      currentFile: "current.ts",
      files: [],
      sections: [],
      lines: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 1);
    mocks.messageListeners[0]?.({
      type: "markNavigatorFileNoteOrphaned",
      relativePath: "src/index.ts",
    });

    await vi.waitFor(() => expect(mocks.markNavigatorFileNoteOrphanedService).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.getNavigatorNotes).toHaveBeenCalledOnce());
    expect(mocks.markNavigatorFileNoteOrphanedService).toHaveBeenCalledWith({
      currentUri: uri,
      notes: {},
      relativePath: "src/index.ts",
    });

    provider.dispose();
  });

  it("deletes a Navigator file notes bundle and refreshes the current and Navigator notes", async () => {
    const workspaceRoot = "/tmp";
    const uri = createUri(`${workspaceRoot}/current.ts`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.deleteNavigatorFileNotesService.mockResolvedValue(true);
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "current.ts",
      relativePath: "current.ts",
      aiAction: "generate",
      sectionNotes: [],
    });
    mocks.getNavigatorNotes.mockResolvedValue({
      kind: "resource",
      projectRootName: "tmp",
      currentFile: "current.ts",
      files: [],
      sections: [],
      lines: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 1);
    mocks.messageListeners[0]?.({
      type: "deleteNavigatorFileNotes",
      relativePath: "src/index.ts",
    });

    await vi.waitFor(() => expect(mocks.deleteNavigatorFileNotesService).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.getNavigatorNotes).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.getResourceNotes).toHaveBeenCalledTimes(2));
    expect(mocks.deleteNavigatorFileNotesService).toHaveBeenCalledWith({
      currentUri: uri,
      notes: {},
      relativePath: "src/index.ts",
    });

    provider.dispose();
  });

  it("does not refresh notes when deleting a Navigator file notes bundle makes no change", async () => {
    const workspaceRoot = "/tmp";
    const uri = createUri(`${workspaceRoot}/current.ts`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.deleteNavigatorFileNotesService.mockResolvedValue(false);
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "current.ts",
      relativePath: "current.ts",
      aiAction: "generate",
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 1);
    mocks.messageListeners[0]?.({
      type: "deleteNavigatorFileNotes",
      relativePath: "src/index.ts",
    });

    await vi.waitFor(() => expect(mocks.deleteNavigatorFileNotesService).toHaveBeenCalledOnce());
    expect(mocks.getResourceNotes).toHaveBeenCalledOnce();
    expect(mocks.getNavigatorNotes).not.toHaveBeenCalled();

    provider.dispose();
  });

  it("deletes a Navigator section note and refreshes the current notes", async () => {
    const workspaceRoot = "/tmp";
    const uri = createUri(`${workspaceRoot}/current.ts`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.deleteNavigatorSectionNoteService.mockResolvedValue(undefined);
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "current.ts",
      relativePath: "current.ts",
      aiAction: "generate",
      sectionNotes: [],
    });
    mocks.getNavigatorNotes.mockResolvedValue({
      kind: "resource",
      projectRootName: "tmp",
      currentFile: "current.ts",
      files: [],
      sections: [],
      lines: [],
    });

    await provider.resolveWebviewView(view);
    provider.postViewMode("navigator");
    await provider.showActiveDocumentNotes(uri, 1);
    mocks.getResourceNotes.mockClear();
    mocks.getNavigatorNotes.mockClear();

    mocks.messageListeners[0]?.({
      type: "deleteNavigatorSectionNote",
      sectionId: "section:run:1-3",
    });

    await vi.waitFor(() => expect(mocks.deleteNavigatorSectionNoteService).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.getResourceNotes).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.getNavigatorNotes).toHaveBeenCalledOnce());
    expect(mocks.deleteNavigatorSectionNoteService).toHaveBeenCalledWith({
      currentUri: uri,
      notes: {},
      sectionId: "section:run:1-3",
    });

    provider.dispose();
  });

  it("deletes a Navigator line note and refreshes the current notes", async () => {
    const workspaceRoot = "/tmp";
    const uri = createUri(`${workspaceRoot}/current.ts`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      {} as never,
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.deleteNavigatorLineNoteService.mockResolvedValue(undefined);
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "current.ts",
      relativePath: "current.ts",
      aiAction: "generate",
      sectionNotes: [],
    });
    mocks.getNavigatorNotes.mockResolvedValue({
      kind: "resource",
      projectRootName: "tmp",
      currentFile: "current.ts",
      files: [],
      sections: [],
      lines: [],
    });

    await provider.resolveWebviewView(view);
    provider.postViewMode("navigator");
    await provider.showActiveDocumentNotes(uri, 1);
    mocks.getResourceNotes.mockClear();
    mocks.getNavigatorNotes.mockClear();

    mocks.messageListeners[0]?.({
      type: "deleteNavigatorLineNote",
      lineId: "line:3",
    });

    await vi.waitFor(() => expect(mocks.deleteNavigatorLineNoteService).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.getResourceNotes).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.getNavigatorNotes).toHaveBeenCalledOnce());
    expect(mocks.deleteNavigatorLineNoteService).toHaveBeenCalledWith({
      currentUri: uri,
      notes: {},
      lineId: "line:3",
    });

    provider.dispose();
  });
});

/**
 * Creates a minimal notes Webview View.
 *
 * @returns Mock Webview View that captures incoming message listeners.
 */
function createWebviewView(): vscodeTypes.WebviewView {
  return {
    webview: {
      options: {},
      html: "",
      postMessage: mocks.postMessage,
      asWebviewUri: (uri: vscodeTypes.Uri) => uri,
      onDidReceiveMessage: (listener: (message: unknown) => void) => {
        mocks.messageListeners.push(listener);
        return { dispose: vi.fn() };
      },
    },
    onDidDispose: () => ({ dispose: vi.fn() }),
  } as unknown as vscodeTypes.WebviewView;
}

function createWorkspaceFolder(fsPath: string): vscodeTypes.WorkspaceFolder {
  return {
    uri: createUri(fsPath),
    name: fsPath.split("/").filter(Boolean).at(-1) ?? fsPath,
    index: mocks.workspaceFolders.length,
  };
}

/**
 * Creates a minimal active text editor with predictable line lengths.
 *
 * @param uri - File URI opened by the editor.
 * @returns Mock active editor.
 */
function createEditor(uri: vscodeTypes.Uri): vscodeTypes.TextEditor {
  return {
    document: {
      uri,
      lineCount: 100,
      lineAt: (line: number) => ({ text: "x".repeat(line + 1) }),
    },
    selection: {
      active: { line: 11, character: 0 },
    },
    revealRange: mocks.revealRange,
    setDecorations: mocks.setDecorations,
  } as unknown as vscodeTypes.TextEditor;
}

/**
 * Creates a minimal local file URI.
 *
 * @param fsPath - Local file-system path.
 * @returns Mock VS Code URI.
 */
function createUri(fsPath: string): vscodeTypes.Uri {
  return {
    scheme: "file",
    fsPath,
    toString: () => `file://${fsPath}`,
  } as vscodeTypes.Uri;
}

/**
 * Reads the range from the most recent non-empty decoration update.
 *
 * @returns Plain range object suitable for equality assertions.
 */
function getLastDecorationRange(): Record<string, number> | undefined {
  const calls = mocks.setDecorations.mock.calls;
  const ranges = calls.at(-1)?.[1] as Array<Record<string, number>> | undefined;

  return ranges?.[0];
}
