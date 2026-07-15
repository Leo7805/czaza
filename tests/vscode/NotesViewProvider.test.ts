/**
 * Unit tests for notes payload delivery and selected-section highlighting.
 */

import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activeTextEditor: undefined as vscodeTypes.TextEditor | undefined,
  getResourceNotes: vi.fn(),
  postMessage: vi.fn().mockResolvedValue(true),
  setDecorations: vi.fn(),
  decorationDispose: vi.fn(),
  showWarningMessage: vi.fn(),
  messageListeners: [] as Array<(message: unknown) => void>,
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue('<script src="./assets/index.js"></script>'),
}));

vi.mock("@vscode/services/getResourceNotesService", () => ({
  getResourceNotes: mocks.getResourceNotes,
}));

vi.mock("vscode", () => ({
  Range: class MockRange {
    readonly startLine: number;
    readonly startCharacter: number;
    readonly endLine: number;
    readonly endCharacter: number;

    constructor(
      startLine: number,
      startCharacter: number,
      endLine: number,
      endCharacter: number,
    ) {
      this.startLine = startLine;
      this.startCharacter = startCharacter;
      this.endLine = endLine;
      this.endCharacter = endCharacter;
    }
  },

  Uri: {
    joinPath: (base: vscodeTypes.Uri, ...parts: string[]) => ({
      scheme: "file",
      fsPath: [base.fsPath, ...parts].join("/"),
      toString: () => `file://${[base.fsPath, ...parts].join("/")}`,
    }),
  },

  window: {
    get activeTextEditor() {
      return mocks.activeTextEditor;
    },

    createTextEditorDecorationType: () => ({
      dispose: mocks.decorationDispose,
    }),
    showWarningMessage: mocks.showWarningMessage,
  },
}));

import { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";

describe("NotesViewProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("confirms All Notes generation and reveals all three AI note levels", async () => {
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

    mocks.showWarningMessage.mockResolvedValue("Generate All Notes");
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

    expect(mocks.showWarningMessage).toHaveBeenCalledWith(
      "All Notes generation may take longer and use more AI tokens.",
      { modal: true },
      "Generate All Notes",
    );
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

  it("does not start All Notes generation when confirmation is cancelled", async () => {
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

    mocks.showWarningMessage.mockResolvedValue(undefined);
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
    await vi.waitFor(() => expect(mocks.showWarningMessage).toHaveBeenCalledOnce());

    expect(generateAllNotes).not.toHaveBeenCalled();
    expect(mocks.getResourceNotes).toHaveBeenCalledOnce();
    expect(mocks.postMessage).not.toHaveBeenCalledWith({
      type: "resourceNotes",
      payload: expect.objectContaining({ isAiActionRunning: true }),
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
