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
  evaluateCzazaResourceAccess: vi.fn(),
  clearNoteStaleStatusService: vi.fn(),
  confirmRuntimeNoteStaleStatusService: vi.fn(),
  refreshRuntimeNoteStateService: vi.fn(),
  deleteNavigatorFileNotesService: vi.fn(),
  deleteNavigatorLineNoteService: vi.fn(),
  deleteNavigatorSectionNoteService: vi.fn(),
  markNavigatorFileNoteOrphanedService: vi.fn(),
  relocateFileNoteService: vi.fn(),
  relocateSectionNoteService: vi.fn(),
  relocateLineNoteService: vi.fn(),
  ensureFileNoteResourceAvailability: vi.fn(),
  createUserSectionNoteService: vi.fn(),
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

vi.mock("@vscode/services/resourceAccess", () => ({
  evaluateCzazaResourceAccess: mocks.evaluateCzazaResourceAccess,
}));

vi.mock("@vscode/services/ensureFileNoteResourceAvailabilityService", () => ({
  ensureFileNoteResourceAvailability: mocks.ensureFileNoteResourceAvailability,
}));

vi.mock("@vscode/services/createUserSectionNoteService", () => ({
  createUserSectionNoteService: mocks.createUserSectionNoteService,
}));

vi.mock("@vscode/services/clearNoteStaleStatusService", () => ({
  clearNoteStaleStatusService: mocks.clearNoteStaleStatusService,
}));

vi.mock("@vscode/services/runtimeState/confirmRuntimeNoteStaleStatusService", () => ({
  confirmRuntimeNoteStaleStatusService: mocks.confirmRuntimeNoteStaleStatusService,
}));

vi.mock("@vscode/services/runtimeState/refreshRuntimeNoteStateService", () => ({
  refreshRuntimeNoteStateService: mocks.refreshRuntimeNoteStateService,
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

vi.mock("@vscode/services/noteRelocation", () => ({
  relocateFileNoteService: mocks.relocateFileNoteService,
  relocateSectionNoteService: mocks.relocateSectionNoteService,
  relocateLineNoteService: mocks.relocateLineNoteService,
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

    createTextEditorDecorationType: (options: unknown) => ({
      options,
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
import { RuntimeNoteStateRegistry } from "@vscode/services/runtimeState/RuntimeNoteStateRegistry";

describe("NotesViewProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clearNoteStaleStatusService.mockReset();
    mocks.confirmRuntimeNoteStaleStatusService.mockReset();
    mocks.refreshRuntimeNoteStateService.mockReset();
    mocks.deleteNavigatorFileNotesService.mockReset();
    mocks.deleteNavigatorLineNoteService.mockReset();
    mocks.deleteNavigatorSectionNoteService.mockReset();
    mocks.getStoredNavigatorFileNotes.mockReset();
    mocks.evaluateCzazaResourceAccess.mockReset();
    mocks.evaluateCzazaResourceAccess.mockImplementation((uri: vscodeTypes.Uri) =>
      uri.scheme === "file" &&
      !uri.fsPath.startsWith("/external-skill/") &&
      !uri.fsPath.includes("/.czaza/notes/")
        ? {
            allowed: true,
            relativePath: uri.fsPath,
            root: { rootDirectory: "/workspace" },
            settings: { outputDirectory: ".czaza" },
          }
        : { allowed: false, reason: "outsideWorkspace" },
    );
    mocks.markNavigatorFileNoteOrphanedService.mockReset();
    mocks.relocateFileNoteService.mockReset();
    mocks.relocateSectionNoteService.mockReset();
    mocks.relocateLineNoteService.mockReset();
    mocks.ensureFileNoteResourceAvailability.mockReset();
    mocks.createUserSectionNoteService.mockReset().mockResolvedValue("section:user:1-2");
    mocks.getNavigatorNotes.mockReset();
    mocks.fsStat.mockReset().mockResolvedValue({
      type: 1,
      size: 0,
      mtime: 0,
      ctime: 0,
    });
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
      createNotesStore(),
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
      payload: expect.objectContaining({
        kind: "file",
        selectedSectionId: "section:second",
      }),
    });
    expect(getLastDecorationRange()).toEqual({
      startLine: 11,
      startCharacter: 0,
      endLine: 14,
      endCharacter: 15,
    });

    // Interacting with a Webview can temporarily clear VS Code's activeTextEditor.
    mocks.activeTextEditor = undefined;

    mocks.messageListeners[0]?.({
      type: "selectSection",
      sectionId: "section:first",
    });

    expect(getLastDecorationRange()).toEqual({
      startLine: 9,
      startCharacter: 0,
      endLine: 19,
      endCharacter: 20,
    });
    await vi.waitFor(() =>
      expect(mocks.postMessage).toHaveBeenCalledWith({
        type: "resourceNotes",
        payload: expect.objectContaining({
          kind: "file",
          selectedSectionId: "section:first",
        }),
      }),
    );

    provider.dispose();
  });

  it("highlights only current Line Notes with visible content in pale yellow", async () => {
    const uri = createUri("/workspace/src/line-notes.ts");
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();
    mocks.activeTextEditor = createEditor(uri);
    const basePayload = {
      kind: "file" as const,
      name: "line-notes.ts",
      relativePath: "src/line-notes.ts",
      aiAction: "generate" as const,
      activeLine: 7,
      sectionNotes: [
        {
          id: "section:one",
          title: "One",
          startLine: 5,
          endLine: 10,
        },
      ],
    };

    mocks.getResourceNotes
      .mockResolvedValueOnce({
        ...basePayload,
        lineNote: {
          id: "line:7",
          line: 7,
          userNote: "Important line.",
          status: { content: "current", anchor: "confirmed" },
        },
      })
      .mockResolvedValueOnce({
        ...basePayload,
        lineNote: {
          id: "line:7",
          line: 7,
          userNote: "   ",
          status: { content: "current", anchor: "confirmed" },
        },
      })
      .mockResolvedValueOnce({
        ...basePayload,
        lineNote: {
          id: "line:7",
          line: 7,
          aiExplanation: { summary: "Important.", detail: "Explains the line." },
          status: { content: "current", anchor: "confirmed" },
        },
      })
      .mockResolvedValueOnce({
        ...basePayload,
        lineNote: {
          id: "line:7",
          line: 7,
          userNote: "No reliable location.",
          status: { content: "current", anchor: "orphaned" },
        },
      });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 7);
    expect(getLastDecorationRangeByBackground("rgba(255, 193, 7, 0.14)")).toMatchObject({
      startLine: 6,
      endLine: 6,
    });

    await provider.showActiveDocumentNotes(uri, 7);
    expect(getLastDecorationRangeByBackground("rgba(255, 193, 7, 0.14)")).toBeUndefined();

    await provider.showActiveDocumentNotes(uri, 7);
    expect(getLastDecorationRangeByBackground("rgba(255, 193, 7, 0.14)")).toMatchObject({
      startLine: 6,
      endLine: 6,
    });

    await provider.showActiveDocumentNotes(uri, 7);
    expect(getLastDecorationRangeByBackground("rgba(255, 193, 7, 0.14)")).toBeUndefined();

    provider.dispose();
  });

  it("keeps a manual section while it covers the cursor and resumes automatic selection after exit", async () => {
    const uri = createUri("/workspace/src/overlap.ts");
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();
    mocks.activeTextEditor = createEditor(uri);

    const outer = {
      id: "section:outer",
      title: "Outer",
      startLine: 10,
      endLine: 30,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const inner = {
      id: "section:inner",
      title: "Inner",
      startLine: 12,
      endLine: 15,
      createdAt: "2026-01-02T00:00:00.000Z",
    };
    const later = {
      id: "section:later",
      title: "Later",
      startLine: 40,
      endLine: 45,
      createdAt: "2026-01-03T00:00:00.000Z",
    };

    mocks.getResourceNotes
      .mockResolvedValueOnce({
        kind: "file",
        name: "overlap.ts",
        relativePath: "src/overlap.ts",
        aiAction: "generate",
        sectionNotes: [outer, inner],
      })
      .mockResolvedValueOnce({
        kind: "file",
        name: "overlap.ts",
        relativePath: "src/overlap.ts",
        aiAction: "generate",
        sectionNotes: [outer, inner],
      })
      .mockResolvedValueOnce({
        kind: "file",
        name: "overlap.ts",
        relativePath: "src/overlap.ts",
        aiAction: "generate",
        sectionNotes: [later],
      });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 13);
    expect(getLastDecorationRange()).toMatchObject({ startLine: 11, endLine: 14 });

    mocks.messageListeners[0]?.({ type: "selectSection", sectionId: outer.id });
    expect(getLastDecorationRange()).toMatchObject({ startLine: 9, endLine: 29 });

    await provider.showActiveDocumentNotes(uri, 14);
    expect(getLastDecorationRange()).toMatchObject({ startLine: 9, endLine: 29 });

    await provider.showActiveDocumentNotes(uri, 42);
    expect(getLastDecorationRange()).toMatchObject({ startLine: 39, endLine: 44 });

    provider.dispose();
  });

  it("opens a Section Note relocate session from the editor selection and saves the range", async () => {
    const uri = createUri("/workspace/src/relocate.ts");
    const registry = new RuntimeNoteStateRegistry();
    const provider = createProviderWithRuntimeRegistry(registry);
    const view = createWebviewView();
    const editor = createEditor(uri);
    editor.selection = {
      anchor: { line: 19, character: 2 },
      active: { line: 30, character: 0 },
      start: { line: 19, character: 2 },
      end: { line: 30, character: 0 },
      isEmpty: false,
    } as vscodeTypes.Selection;
    mocks.activeTextEditor = editor;
    mocks.openTextDocument.mockResolvedValue({
      uri,
      languageId: "typescript",
      getText: () => "const value = 1;",
    });
    mocks.refreshRuntimeNoteStateService.mockResolvedValue({
      kind: "current",
      registryChange: "deleted",
    });
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "relocate.ts",
      relativePath: "src/relocate.ts",
      aiAction: "generate",
      sectionNotes: [
        {
          id: "section:one",
          title: "One",
          startLine: 2,
          endLine: 8,
        },
      ],
    });
    mocks.relocateSectionNoteService.mockResolvedValue(undefined);

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 20);
    mocks.messageListeners[0]?.({
      type: "startNoteRelocate",
      target: {
        level: "section",
        sectionId: "section:one",
        startLine: 2,
        endLine: 8,
      },
    });

    await vi.waitFor(() =>
      expect(mocks.postMessage).toHaveBeenCalledWith({
        type: "noteRelocateSuggestion",
        suggestion: { level: "section", startLine: 20, endLine: 30 },
      }),
    );
    mocks.messageListeners[0]?.({
      type: "relocateSectionNote",
      sectionId: "section:one",
      startLine: 20,
      endLine: 30,
    });

    await vi.waitFor(() =>
      expect(mocks.relocateSectionNoteService).toHaveBeenCalledWith({
        uri,
        notes: expect.objectContaining({ location: { kind: "team" } }),
        sectionId: "section:one",
        startLine: 20,
        endLine: 30,
      }),
    );
    await vi.waitFor(() =>
      expect(mocks.postMessage).toHaveBeenCalledWith({ type: "noteRelocated" }),
    );
    expect(mocks.refreshRuntimeNoteStateService).toHaveBeenCalledWith({
      document: expect.objectContaining({ uri }),
      notes: expect.objectContaining({ location: { kind: "team" } }),
      registry,
      now: expect.any(String),
    });

    provider.dispose();
  });

  it("reveals a navigator section and refreshes notes for its first line", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
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
      notes: expect.objectContaining({ location: { kind: "team" } }),
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
      createNotesStore(),
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
      notes: expect.objectContaining({ location: { kind: "team" } }),
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
      createNotesStore(),
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
      createNotesStore(),
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
      createNotesStore(),
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
      notes: expect.objectContaining({ location: { kind: "team" } }),
    });
    expect(mocks.showErrorMessage).not.toHaveBeenCalled();

    provider.dispose();
  });

  it("runs file note generation once and refreshes the current payload", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const generateFileNotes = vi.fn().mockResolvedValue(true);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
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

    expect(generateFileNotes).toHaveBeenCalledWith(uri, { kind: "team" });
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

  it("passes the selected Personal Notes location to AI generation", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const personal = { kind: "personal" as const, memberId: "leo-12345678" };
    const generateFileNotes = vi.fn().mockResolvedValue(true);
    const noteScope = {
      resolveLocation: vi.fn().mockResolvedValue(personal),
    } as never;
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
      generateFileNotes,
      vi.fn().mockResolvedValue(undefined),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      noteScope,
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

    await vi.waitFor(() => expect(generateFileNotes).toHaveBeenCalledWith(uri, personal));
    provider.dispose();
  });

  it("runs All Notes generation and reveals all three AI note levels", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const generateAllNotes = vi.fn().mockResolvedValue(true);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
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
    expect(generateAllNotes).toHaveBeenCalledWith(uri, { kind: "team" }, {
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
      createNotesStore(),
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
      createNotesStore(),
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
    expect(generateAllNotes).toHaveBeenNthCalledWith(1, uri, { kind: "team" }, {
      onProgress: expect.any(Function),
    });
    expect(generateAllNotes).toHaveBeenNthCalledWith(2, uri, { kind: "team" }, {
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
      createNotesStore(),
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
    expect(generateLineNote).toHaveBeenCalledWith(uri, 12, { kind: "team" });
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
      createNotesStore(),
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
    expect(generateSectionNote).toHaveBeenCalledWith(uri, "section:run:1-3", { kind: "team" });
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
      createNotesStore(),
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

  it("shows and cancels a new Section draft without persisting it", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();
    const document = createDraftDocument(uri);

    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.openUserSectionNoteEditor({ document, startLine: 1, endLine: 2 });

    expect(mocks.postMessage).toHaveBeenLastCalledWith({
      type: "resourceNotes",
      payload: expect.objectContaining({
        editTarget: { level: "section", sectionId: "section:draft:1-2" },
        sectionNotes: [expect.objectContaining({ id: "section:draft:1-2", isDraft: true })],
      }),
    });

    mocks.messageListeners[0]?.({
      type: "cancelSectionNoteDraft",
      sectionId: "section:draft:1-2",
    });
    await vi.waitFor(() => expect(mocks.postMessage).toHaveBeenCalledTimes(3));
    expect(mocks.createUserSectionNoteService).not.toHaveBeenCalled();
    expect(mocks.postMessage).toHaveBeenLastCalledWith({
      type: "resourceNotes",
      payload: expect.objectContaining({ sectionNotes: [] }),
    });
    provider.dispose();
  });

  it("persists a new Section draft only after non-empty content is saved", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();
    const document = createDraftDocument(uri);

    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      sectionNotes: [],
    });
    mocks.openTextDocument.mockResolvedValue(document);

    await provider.resolveWebviewView(view);
    await provider.openUserSectionNoteEditor({ document, startLine: 1, endLine: 2 });
    mocks.messageListeners[0]?.({
      type: "saveUserNote",
      target: { level: "section", sectionId: "section:draft:1-2" },
      userNote: "Saved section.",
    });

    await vi.waitFor(() => expect(mocks.createUserSectionNoteService).toHaveBeenCalledOnce());
    expect(mocks.createUserSectionNoteService).toHaveBeenCalledWith(expect.objectContaining({
      document,
      startLine: 1,
      endLine: 2,
      userNote: "Saved section.",
    }));
    provider.dispose();
  });

  it("reports a refresh failure without claiming the user note failed to save", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const saveUserNote = vi.fn().mockResolvedValue(undefined);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
      vi.fn().mockResolvedValue(true),
      saveUserNote,
    );
    const view = createWebviewView();

    mocks.getResourceNotes
      .mockResolvedValueOnce({
        kind: "file",
        name: "index.ts",
        relativePath: "src/index.ts",
        aiAction: "generate",
        sectionNotes: [],
      })
      .mockRejectedValueOnce(new Error("Refresh unavailable."));

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 1);
    mocks.postMessage.mockClear();
    mocks.messageListeners[0]?.({
      type: "saveUserNote",
      target: { level: "file" },
      userNote: "Saved content.",
    });

    await vi.waitFor(() => expect(saveUserNote).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(mocks.postMessage).toHaveBeenCalledWith({
        type: "notice",
        notice: expect.objectContaining({
          tone: "error",
          title: "User Note Saved, but View Refresh Failed",
          message: "Refresh unavailable.",
        }),
      }),
    );
    expect(mocks.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        notice: expect.objectContaining({ title: "Could Not Save User Note" }),
      }),
    );

    provider.dispose();
  });

  it("clears the previous editable payload and blocks delayed saves for an outside resource", async () => {
    const insideUri = createUri("/workspace/src/index.ts");
    const outsideUri = createUri("/external-skill/SKILL.md");
    const saveUserNote = vi.fn().mockResolvedValue(undefined);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
      vi.fn().mockResolvedValue(true),
      saveUserNote,
    );
    const view = createWebviewView();

    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      activeLine: 1,
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(insideUri, 1);
    mocks.postMessage.mockClear();

    await provider.showActiveDocumentNotes(outsideUri, 1);

    expect(mocks.postMessage).toHaveBeenCalledWith({
      type: "resourceNotes",
      payload: { kind: "outsideRoot" },
    });
    expect(mocks.getResourceNotes).toHaveBeenCalledTimes(1);

    mocks.messageListeners[0]?.({
      type: "saveUserNote",
      target: { level: "file" },
      userNote: "Must not be saved.",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(saveUserNote).not.toHaveBeenCalled();
    provider.dispose();
  });

  it("saves a directory file note without enabling AI generation", async () => {
    const uri = createUri("/workspace/src");
    const generateFileNotes = vi.fn().mockResolvedValue(true);
    const saveUserNote = vi.fn().mockResolvedValue(undefined);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
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
      createNotesStore(),
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
      createNotesStore(),
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
      uri: expect.objectContaining({ fsPath: newUri.fsPath }),
      notes: expect.objectContaining({ location: { kind: "team" } }),
      activeLine: 12,
    });

    provider.dispose();
  });

  it("remaps a current file when its parent directory moves", async () => {
    const oldDirectoryUri = createUri("/workspace/src/feature");
    const newDirectoryUri = createUri("/workspace/src/domain");
    const oldFileUri = createUri("/workspace/src/feature/nested/index.ts");
    const newFileUri = createUri("/workspace/src/domain/nested/index.ts");
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.activeTextEditor = createEditor(newFileUri);
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/domain/nested/index.ts",
      aiAction: "generate",
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showResourceNotes(oldFileUri);
    await provider.refreshAfterResourceMove(oldDirectoryUri, newDirectoryUri);

    expect(mocks.getResourceNotes).toHaveBeenLastCalledWith({
      uri: expect.objectContaining({ fsPath: newFileUri.fsPath }),
      notes: expect.objectContaining({ location: { kind: "team" } }),
      activeLine: 12,
    });

    provider.dispose();
  });

  it("resolves stale note content from a webview context-menu action", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
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
      notes: expect.objectContaining({ location: { kind: "team" } }),
      target: { level: "file" },
    });

    provider.dispose();
  });

  it("routes Runtime stale confirmation through the hash-guarded service", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const registry = new RuntimeNoteStateRegistry();
    const provider = createProviderWithRuntimeRegistry(registry);
    const view = createWebviewView();

    mockAllowedResource("src/index.ts");
    mocks.confirmRuntimeNoteStaleStatusService.mockResolvedValue({
      kind: "confirmed",
    });
    mocks.getResourceNotes.mockResolvedValue({
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
    registry.setState(createRuntimeFileState("src/index.ts"));

    await provider.resolveWebviewView(view);
    await provider.showResourceNotes(uri);
    mocks.messageListeners[0]?.({
      type: "clearNoteStaleStatus",
      target: { level: "file" },
    });

    await vi.waitFor(() =>
      expect(mocks.confirmRuntimeNoteStaleStatusService).toHaveBeenCalledOnce(),
    );
    expect(mocks.clearNoteStaleStatusService).not.toHaveBeenCalled();
    expect(mocks.confirmRuntimeNoteStaleStatusService).toHaveBeenCalledWith({
      uri,
      notes: expect.objectContaining({ location: { kind: "team" } }),
      registry,
      target: { level: "file" },
    });
    provider.dispose();
  });

  it("confirms Runtime stale status in the selected Personal Store", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const registry = new RuntimeNoteStateRegistry();
    const personal = { kind: "personal" as const, memberId: "leo-12345678" };
    const noteScope = {
      resolveLocation: vi.fn().mockResolvedValue(personal),
      getScope: vi.fn(),
      setScope: vi.fn(),
    };
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
      undefined,
      undefined,
      undefined,
      undefined,
      registry,
      noteScope as never,
    );
    const view = createWebviewView();

    mockAllowedResource("src/index.ts");
    mocks.confirmRuntimeNoteStaleStatusService.mockResolvedValue({
      kind: "confirmed",
    });
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showResourceNotes(uri);
    mocks.messageListeners[0]?.({
      type: "clearNoteStaleStatus",
      target: { level: "file" },
    });

    await vi.waitFor(() =>
      expect(mocks.confirmRuntimeNoteStaleStatusService).toHaveBeenCalledOnce(),
    );
    expect(mocks.confirmRuntimeNoteStaleStatusService).toHaveBeenCalledWith({
      uri,
      notes: expect.objectContaining({ location: personal }),
      registry,
      target: { level: "file" },
    });
    expect(mocks.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        notice: expect.objectContaining({
          title: "Status Updates Is Available in Team Notes",
        }),
      }),
    );
    provider.dispose();
  });

  it("resolves stale content for a Navigator file item and refreshes Navigator notes", async () => {
    const workspaceRoot = "/tmp";
    const uri = createUri(`${workspaceRoot}/current.ts`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
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
      notes: expect.objectContaining({ location: { kind: "team" } }),
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

  it("routes Navigator Runtime stale through the hash-guarded confirmation service", async () => {
    const uri = createUri("/tmp/current.ts");
    const registry = new RuntimeNoteStateRegistry();
    const provider = createProviderWithRuntimeRegistry(registry);
    const view = createWebviewView();

    mocks.workspaceFolders.push(createWorkspaceFolder("/tmp"));
    mocks.evaluateCzazaResourceAccess.mockReturnValue({
      allowed: true,
      relativePath: "current.ts",
      root: { rootDirectory: "/tmp" },
      settings: { outputDirectory: ".czaza" },
    });
    mocks.confirmRuntimeNoteStaleStatusService.mockResolvedValue({
      kind: "confirmed",
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
      files: [],
      sections: [],
      lines: [],
    });
    registry.setState(createRuntimeFileState("src/other.ts"));

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 1);
    mocks.messageListeners[0]?.({
      type: "clearNavigatorFileStaleStatus",
      relativePath: "src/other.ts",
    });

    await vi.waitFor(() =>
      expect(mocks.confirmRuntimeNoteStaleStatusService).toHaveBeenCalledOnce(),
    );
    expect(mocks.confirmRuntimeNoteStaleStatusService).toHaveBeenCalledWith({
      uri: expect.objectContaining({ fsPath: "/tmp/src/other.ts" }),
      notes: expect.objectContaining({ location: { kind: "team" } }),
      registry,
      target: { level: "file" },
    });
    expect(mocks.clearNoteStaleStatusService).not.toHaveBeenCalled();
    provider.dispose();
  });

  it("shows missing-source Clear stale failures in the CZaza Notice UI", async () => {
    const workspaceRoot = "/Users/leo/Projects/DocuMind";
    const uri = createUri(`${workspaceRoot}/current.ts`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();
    const missingError = new Error(
      `Error: ENOENT: no such file or directory, stat '${workspaceRoot}/testb.ts'`,
    );

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.clearNoteStaleStatusService.mockRejectedValue(missingError);
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
      type: "clearVisibleNavigatorStaleContent",
      targets: [{ level: "file", relativePath: "testb.ts" }],
    });

    await vi.waitFor(() =>
      expect(mocks.postMessage).toHaveBeenCalledWith({
        type: "notice",
        notice: {
          tone: "error",
          title: "Source File Not Found",
          message:
            "testb.ts no longer exists. Relocate or delete its stale Notes before trying again.",
          actions: [{ label: "Close", variant: "primary" }],
        },
      }),
    );
    expect(mocks.showErrorMessage).not.toHaveBeenCalled();
    provider.dispose();
  });

  it("shows ordinary Clear stale failures in the CZaza Notice UI", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const view = createWebviewView();

    mocks.clearNoteStaleStatusService.mockRejectedValue(
      new Error("Error: Unable to update the Note Store."),
    );
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      fileNote: {
        status: { content: "stale", anchor: "confirmed" },
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

    await vi.waitFor(() =>
      expect(mocks.postMessage).toHaveBeenCalledWith({
        type: "notice",
        notice: {
          tone: "error",
          title: "Could Not Clear Stale Content",
          message: "Unable to update the Note Store.",
          actions: [{ label: "Close", variant: "primary" }],
        },
      }),
    );
    expect(mocks.showErrorMessage).not.toHaveBeenCalled();
    provider.dispose();
  });

  it("explains when a stale note cannot be marked reviewed", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const registry = new RuntimeNoteStateRegistry();
    const provider = createProviderWithRuntimeRegistry(registry);
    const view = createWebviewView();

    mockAllowedResource("src/index.ts");
    mocks.confirmRuntimeNoteStaleStatusService.mockResolvedValue({
      kind: "unchanged",
    });
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showResourceNotes(uri);
    mocks.messageListeners[0]?.({
      type: "clearNoteStaleStatus",
      target: { level: "file" },
    });

    await vi.waitFor(() =>
      expect(mocks.postMessage).toHaveBeenCalledWith({
        type: "notice",
        notice: {
          tone: "warning",
          title: "Could Not Mark Reviewed",
          message:
            "This note's anchor no longer matches the current source. Relocate it before marking reviewed.",
          actions: [{ label: "Close", variant: "primary" }],
        },
      }),
    );
    expect(mocks.clearNoteStaleStatusService).not.toHaveBeenCalled();
    provider.dispose();
  });

  it("reports when a stale note is already up to date", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const registry = new RuntimeNoteStateRegistry();
    const provider = createProviderWithRuntimeRegistry(registry);
    const view = createWebviewView();

    mockAllowedResource("src/index.ts");
    mocks.confirmRuntimeNoteStaleStatusService.mockResolvedValue({
      kind: "notConfirmable",
    });
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showResourceNotes(uri);
    mocks.messageListeners[0]?.({
      type: "clearNoteStaleStatus",
      target: { level: "file" },
    });

    await vi.waitFor(() =>
      expect(mocks.postMessage).toHaveBeenCalledWith({
        type: "notice",
        notice: {
          tone: "info",
          title: "Already Up to Date",
          message: "This note's content is already current.",
          actions: [{ label: "Close", variant: "primary" }],
        },
      }),
    );
    expect(mocks.clearNoteStaleStatusService).not.toHaveBeenCalled();
    provider.dispose();
  });

  it("relocates a File Note through the unified session and opens the target", async () => {
    const workspaceRoot = "/tmp";
    const currentUri = createUri(`${workspaceRoot}/current.ts`);
    const targetUri = createUri(`${workspaceRoot}/src/new.ts`);
    const runtimeRegistry = new RuntimeNoteStateRegistry();
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
      undefined,
      undefined,
      undefined,
      undefined,
      runtimeRegistry,
    );
    const view = createWebviewView();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.relocateFileNoteService.mockResolvedValue({
      previousRelativePath: "src/old.ts",
      nextRelativePath: "src/new.ts",
      targetUri,
    });
    mocks.openTextDocument.mockResolvedValue({
      uri: targetUri,
      languageId: "typescript",
      getText: () => "export const relocated = true;",
    });
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
    mocks.activeTextEditor = createEditor(targetUri);
    mocks.messageListeners[0]?.({
      type: "startNoteRelocate",
      target: { level: "file", fromRelativePath: "src/old.ts" },
    });
    await vi.waitFor(() =>
      expect(mocks.postMessage).toHaveBeenCalledWith({
        type: "openNoteRelocate",
        target: {
          level: "file",
          fromRelativePath: "src/old.ts",
          managedNotesRelativePath: ".czaza/notes/team",
        },
      }),
    );
    await vi.waitFor(() =>
      expect(mocks.postMessage).toHaveBeenCalledWith({
        type: "noteRelocateSuggestion",
        suggestion: { level: "file", relativePath: "src/new.ts" },
      }),
    );
    mocks.messageListeners[0]?.({
      type: "relocateFileNote",
      fromRelativePath: "src/old.ts",
      toRelativePath: "src/new.ts",
    });

    await vi.waitFor(() => expect(mocks.relocateFileNoteService).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(mocks.postMessage).toHaveBeenCalledWith({
        type: "noteRelocated",
      }),
    );
    expect(mocks.relocateFileNoteService).toHaveBeenCalledWith({
      currentUri,
      notes: expect.objectContaining({ location: { kind: "team" } }),
      fromRelativePath: "src/old.ts",
      toRelativePath: "src/new.ts",
    });
    expect(mocks.refreshRuntimeNoteStateService).toHaveBeenCalledWith({
      document: expect.objectContaining({ uri: targetUri }),
      notes: expect.objectContaining({ location: { kind: "team" } }),
      registry: runtimeRegistry,
      now: expect.any(String),
    });
    expect(mocks.getNavigatorNotes).toHaveBeenCalledWith({
      uri: currentUri,
      notes: expect.objectContaining({ location: { kind: "team" } }),
      selectedSectionId: undefined,
      activeLine: undefined,
    });
    expect(mocks.openTextDocument).toHaveBeenCalledWith(targetUri);
    expect(mocks.showTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ uri: targetUri }),
      { preview: false },
    );
    expect(mocks.getResourceNotes).toHaveBeenLastCalledWith({
      uri: targetUri,
      notes: expect.objectContaining({ location: { kind: "team" } }),
      activeLine: 12,
    });

    provider.dispose();
  });

  it("views non-orphaned Navigator file notes by opening the source file", async () => {
    const workspaceRoot = "/tmp";
    const currentUri = createUri(`${workspaceRoot}/current.ts`);
    const targetUri = createUri(`${workspaceRoot}/src/index.ts`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
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
      createNotesStore(),
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
      notes: expect.objectContaining({ location: { kind: "team" } }),
    });
    expect(mocks.postMessage).toHaveBeenCalledWith({ type: "notesViewMode", mode: "detail" });

    provider.dispose();
  });

  it("views orphaned Navigator file notes without opening a source file", async () => {
    const workspaceRoot = "/tmp";
    const currentUri = createUri(`${workspaceRoot}/current.ts`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
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
      notes: expect.objectContaining({ location: { kind: "team" } }),
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

  it("marks a Navigator file note orphaned and refreshes Navigator notes", async () => {
    const workspaceRoot = "/tmp";
    const uri = createUri(`${workspaceRoot}/current.ts`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
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
      notes: expect.objectContaining({ location: { kind: "team" } }),
      relativePath: "src/index.ts",
    });

    provider.dispose();
  });

  it("deletes a Navigator file notes bundle and refreshes the current and Navigator notes", async () => {
    const workspaceRoot = "/tmp";
    const uri = createUri(`${workspaceRoot}/current.ts`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
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
      notes: expect.objectContaining({ location: { kind: "team" } }),
      relativePath: "src/index.ts",
    });

    provider.dispose();
  });

  it("does not refresh notes when deleting a Navigator file notes bundle makes no change", async () => {
    const workspaceRoot = "/tmp";
    const uri = createUri(`${workspaceRoot}/current.ts`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
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
      createNotesStore(),
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
      notes: expect.objectContaining({ location: { kind: "team" } }),
      sectionId: "section:run:1-3",
    });

    provider.dispose();
  });

  it("deletes a Navigator line note and refreshes the current notes", async () => {
    const workspaceRoot = "/tmp";
    const uri = createUri(`${workspaceRoot}/current.ts`);
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
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
      notes: expect.objectContaining({ location: { kind: "team" } }),
      lineId: "line:3",
    });

    provider.dispose();
  });

  it("refreshes visible File Notes with matching Runtime State", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const registry = new RuntimeNoteStateRegistry();
    const provider = createProviderWithRuntimeRegistry(registry);
    const view = createWebviewView();

    mockAllowedResource("src/index.ts");
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      fileNote: {
        status: { content: "current", anchor: "confirmed" },
      },
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 1);
    mocks.postMessage.mockClear();
    registry.setState(createRuntimeFileState("src/index.ts"));

    await vi.waitFor(() => expect(mocks.getResourceNotes).toHaveBeenCalledTimes(2));
    const message = [...mocks.postMessage.mock.calls]
      .reverse()
      .map(([candidate]) => candidate)
      .find((candidate) => candidate.type === "resourceNotes");

    expect(message?.payload.fileNote.status).toEqual({
      content: "stale",
      anchor: "confirmed",
    });
    provider.dispose();
  });

  it("overlays missing Runtime State without reopening the deleted source", async () => {
    const uri = createUri("/workspace/src/missing.ts");
    const registry = new RuntimeNoteStateRegistry();
    const provider = createProviderWithRuntimeRegistry(registry);
    const view = createWebviewView();

    mockAllowedResource("src/missing.ts");
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "missing.ts",
      relativePath: "src/missing.ts",
      aiAction: "generate",
      fileNote: {
        userNote: "Tracked note.",
        status: { content: "current", anchor: "confirmed" },
      },
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 1);
    mocks.postMessage.mockClear();
    registry.setState(createMissingRuntimeFileState("src/missing.ts"));

    await vi.waitFor(() => {
      expect(mocks.postMessage).toHaveBeenCalledWith({
        type: "resourceNotes",
        payload: expect.objectContaining({
          fileNote: expect.objectContaining({
            status: { content: "current", anchor: "needsConfirmation" },
            runtimeStatus: { content: "current", anchor: "needsConfirmation" },
          }),
        }),
      });
    });
    expect(mocks.getResourceNotes).toHaveBeenCalledOnce();
    provider.dispose();
  });

  it("refreshes Navigator status for another resource in the same scope", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const registry = new RuntimeNoteStateRegistry();
    const provider = createProviderWithRuntimeRegistry(registry);
    const view = createWebviewView();

    mockAllowedResource("src/index.ts");
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      sectionNotes: [],
    });
    mocks.getNavigatorNotes.mockResolvedValue({
      kind: "resource",
      projectRootName: "workspace",
      currentFile: "src/index.ts",
      files: [
        {
          name: "other.ts",
          relativePath: "src/other.ts",
          resourceKind: "file",
          preview: "Other file.",
          status: { content: "current", anchor: "confirmed" },
        },
      ],
      sections: [],
      lines: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 1);
    provider.postViewMode("navigator");
    await vi.waitFor(() => expect(mocks.getNavigatorNotes).toHaveBeenCalledOnce());
    mocks.postMessage.mockClear();
    registry.setState(createRuntimeFileState("src/other.ts"));

    await vi.waitFor(() => expect(mocks.getNavigatorNotes).toHaveBeenCalledTimes(2));
    expect(mocks.postMessage).toHaveBeenCalledWith({
      type: "navigatorNotes",
      payload: expect.objectContaining({
        files: [
          expect.objectContaining({
            relativePath: "src/other.ts",
            status: { content: "stale", anchor: "confirmed" },
            runtimeStatus: { content: "stale", anchor: "confirmed" },
          }),
        ],
      }),
    });
    provider.dispose();
  });

  it("uses the same Personal Store for Detail and Navigator", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const personal = { kind: "personal" as const, memberId: "leo-12345678" };
    const noteScope = {
      resolveLocation: vi.fn().mockResolvedValue(personal),
      getScope: vi.fn().mockReturnValue("personal"),
      setScope: vi.fn(),
    };
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      noteScope as never,
    );
    const view = createWebviewView();

    mockAllowedResource("src/index.ts");
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      sectionNotes: [],
    });
    mocks.getNavigatorNotes.mockResolvedValue({
      kind: "resource",
      projectRootName: "workspace",
      currentFile: "src/index.ts",
      files: [],
      sections: [],
      lines: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showResourceNotes(uri);
    provider.postViewMode("navigator");

    await vi.waitFor(() => expect(mocks.getNavigatorNotes).toHaveBeenCalledOnce());
    expect(mocks.getResourceNotes).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: expect.objectContaining({ location: personal }),
      }),
    );
    expect(mocks.getNavigatorNotes).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: expect.objectContaining({ location: personal }),
      }),
    );
    provider.dispose();
  });

  it("resolves the selected Team or Personal Store for every active file change", async () => {
    const firstUri = createUri("/workspace/src/first.ts");
    const secondUri = createUri("/workspace/src/second.ts");
    const team = { kind: "team" as const };
    const personal = { kind: "personal" as const, memberId: "leo-12345678" };
    const noteScope = {
      resolveLocation: vi.fn().mockResolvedValueOnce(team).mockResolvedValueOnce(personal),
      getScope: vi.fn(),
      setScope: vi.fn(),
    };
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      noteScope as never,
    );

    mockAllowedResource("src/first.ts");
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "source.ts",
      relativePath: "src/source.ts",
      aiAction: "generate",
      sectionNotes: [],
    });

    await provider.showActiveDocumentNotes(firstUri, 1);
    await provider.showActiveDocumentNotes(secondUri, 1);

    expect(noteScope.resolveLocation).toHaveBeenCalledTimes(2);
    expect(mocks.getResourceNotes).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        uri: firstUri,
        notes: expect.objectContaining({ location: team }),
      }),
    );
    expect(mocks.getResourceNotes).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        uri: secondUri,
        notes: expect.objectContaining({ location: personal }),
      }),
    );
    provider.dispose();
  });

  it("ignores a stale selection update after a newer active file starts loading", async () => {
    const oldUri = createUri("/workspace/src/old.ts");
    const nextUri = createUri("/workspace/src/next.ts");
    const provider = new NotesViewProvider(
      createUri("/extension"),
      createNotesStore(),
      vi.fn().mockResolvedValue(true),
      vi.fn().mockResolvedValue(undefined),
    );
    const oldPayload = {
      kind: "file" as const,
      name: "old.ts",
      relativePath: "src/old.ts",
      aiAction: "generate" as const,
      sectionNotes: [],
    };
    let resolveNext: ((payload: typeof oldPayload) => void) | undefined;
    mocks.getResourceNotes
      .mockResolvedValueOnce(oldPayload)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveNext = resolve;
      }));

    await provider.showActiveDocumentNotes(oldUri, 1);
    const nextRequest = provider.showActiveDocumentNotes(nextUri, 1);
    await provider.showActiveDocumentLineNotes(oldUri, 8);

    expect(mocks.getResourceNotes).toHaveBeenCalledTimes(2);
    resolveNext?.({ ...oldPayload, name: "next.ts", relativePath: "src/next.ts" });
    await nextRequest;
    provider.dispose();
  });

  it("ignores Runtime State for another resource and after disposal", async () => {
    const uri = createUri("/workspace/src/index.ts");
    const registry = new RuntimeNoteStateRegistry();
    const provider = createProviderWithRuntimeRegistry(registry);
    const view = createWebviewView();

    mockAllowedResource("src/index.ts");
    mocks.getResourceNotes.mockResolvedValue({
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      sectionNotes: [],
    });

    await provider.resolveWebviewView(view);
    await provider.showActiveDocumentNotes(uri, 1);
    registry.setState(createRuntimeFileState("src/other.ts"));
    provider.dispose();
    registry.setState(createRuntimeFileState("src/index.ts"));

    await Promise.resolve();
    expect(mocks.getResourceNotes).toHaveBeenCalledOnce();
  });
});

/**
 * Creates a provider connected to the supplied Runtime State registry.
 *
 * @param registry - Shared session-only Runtime State registry.
 * @returns Notes provider configured for Runtime State UI tests.
 */
function createProviderWithRuntimeRegistry(
  registry: RuntimeNoteStateRegistry,
): NotesViewProvider {
  return new NotesViewProvider(
    createUri("/extension"),
    createNotesStore(),
    vi.fn().mockResolvedValue(true),
    vi.fn().mockResolvedValue(undefined),
    undefined,
    undefined,
    undefined,
    undefined,
    registry,
  );
}

/**
 * Configures Resource Gate coordinates for one workspace-relative file.
 *
 * @param relativePath - Source path relative to the workspace root.
 */
function mockAllowedResource(relativePath: string): void {
  mocks.evaluateCzazaResourceAccess.mockReturnValue({
    allowed: true,
    relativePath,
    root: { rootDirectory: "/workspace" },
    settings: { outputDirectory: ".czaza" },
  });
}

/**
 * Creates a root Note Store test double that returns one Team-scoped Store.
 *
 * @returns Note Store constructor argument for the provider.
 */
function createNotesStore(): never {
  return {
    scope: (
      workspaceRoot: string,
      outputDirectory: string,
      location: { kind: "team" } | { kind: "personal"; memberId: string },
    ) => ({ workspaceRoot, outputDirectory, location }),
  } as never;
}

/**
 * Creates one stale File Note Runtime State fixture.
 *
 * @param relativePath - Source path represented by the state.
 * @returns Runtime State with a stale File Note overlay.
 */
function createRuntimeFileState(relativePath: string) {
  return {
    workspaceRoot: "/workspace",
    outputDirectory: ".czaza",
    relativePath,
    issues: ["stale"] as const,
    reason: "sourceChanged" as const,
    observedAt: "2026-07-29T00:00:00.000Z",
    targetChanges: [
      {
        kind: "file" as const,
        status: { content: "stale" as const, anchor: "confirmed" as const },
      },
    ],
  };
}

/**
 * Creates one missing File Note Runtime State fixture.
 *
 * @param relativePath - Source path represented by the state.
 * @returns Runtime State with a missing File Note overlay.
 */
function createMissingRuntimeFileState(relativePath: string) {
  return {
    workspaceRoot: "/workspace",
    outputDirectory: ".czaza",
    relativePath,
    issues: ["missing", "locationReview"] as const,
    reason: "resourceMissing" as const,
    observedAt: "2026-07-30T00:00:00.000Z",
    targetChanges: [
      {
        kind: "file" as const,
        status: {
          content: "current" as const,
          anchor: "needsConfirmation" as const,
        },
      },
    ],
  };
}

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
      anchor: { line: 11, character: 0 },
      active: { line: 11, character: 0 },
      start: { line: 11, character: 0 },
      end: { line: 11, character: 0 },
      isEmpty: true,
    },
    revealRange: mocks.revealRange,
    setDecorations: mocks.setDecorations,
  } as unknown as vscodeTypes.TextEditor;
}

/** Creates a stable text document used by unsaved Section draft tests. */
function createDraftDocument(uri: vscodeTypes.Uri): vscodeTypes.TextDocument {
  const source = "const value = 1;\nreturn value;";

  return {
    uri,
    languageId: "typescript",
    lineCount: 2,
    getText: () => source,
    lineAt: (line: number) => ({ text: source.split("\n")[line] ?? "" }),
  } as vscodeTypes.TextDocument;
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

function getLastDecorationRangeByBackground(
  backgroundColor: string,
): Record<string, number> | undefined {
  const call = [...mocks.setDecorations.mock.calls]
    .reverse()
    .find(
      ([decorationType]) =>
        (decorationType as { options?: { backgroundColor?: string } }).options
          ?.backgroundColor === backgroundColor,
    );
  const ranges = call?.[1] as Array<Record<string, number>> | undefined;

  return ranges?.[0];
}
