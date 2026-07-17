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
  clearNoteStaleStatusService: vi.fn(),
  ensureFileNoteResourceAvailability: vi.fn(),
  postMessage: vi.fn().mockResolvedValue(true),
  setDecorations: vi.fn(),
  decorationDispose: vi.fn(),
  openTextDocument: vi.fn(),
  showTextDocument: vi.fn(),
  revealRange: vi.fn(),
  showWarningMessage: vi.fn(),
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

vi.mock("@vscode/services/ensureFileNoteResourceAvailabilityService", () => ({
  ensureFileNoteResourceAvailability: mocks.ensureFileNoteResourceAvailability,
}));

vi.mock("@vscode/services/clearNoteStaleStatusService", () => ({
  clearNoteStaleStatusService: mocks.clearNoteStaleStatusService,
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
    openTextDocument: mocks.openTextDocument,
  },

  window: {
    get activeTextEditor() {
      return mocks.activeTextEditor;
    },

    createTextEditorDecorationType: () => ({
      dispose: mocks.decorationDispose,
    }),
    showTextDocument: mocks.showTextDocument,
    showWarningMessage: mocks.showWarningMessage,
  },
}));

import { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";

describe("NotesViewProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clearNoteStaleStatusService.mockReset();
    mocks.ensureFileNoteResourceAvailability.mockReset();
    mocks.getNavigatorNotes.mockReset();
    mocks.workspaceFolders.length = 0;
    mocks.messageListeners.length = 0;
    mocks.activeTextEditor = undefined;
  });

  it("highlights the first section and switches highlight from a webview selection", async () => {
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
    expect(generateAllNotes).toHaveBeenCalledWith(uri);
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
    await provider.showResourceNotes(uri);
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
