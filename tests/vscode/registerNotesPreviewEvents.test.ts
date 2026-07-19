/**
 * Unit tests for keeping the notes preview synchronized with active editors.
 */

import type * as vscodeTypes from "vscode";
import * as vscode from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerNotesPreviewEvents } from "@vscode/events";
import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";

type ActiveEditorListener = (editor: vscodeTypes.TextEditor | undefined) => void;
type SelectionListener = (event: vscodeTypes.TextEditorSelectionChangeEvent) => void;
type TabListener = () => void;

const mocks = vi.hoisted(() => ({
  activeTextEditor: undefined as vscodeTypes.TextEditor | undefined,
  activeEditorListeners: [] as ActiveEditorListener[],
  selectionListeners: [] as SelectionListener[],
  tabListeners: [] as TabListener[],
  tabGroupListeners: [] as TabListener[],
  activeTab: undefined as vscodeTypes.Tab | undefined,
}));

vi.mock("vscode", () => ({
  TabInputText: class TabInputText {
    uri: vscodeTypes.Uri;
    constructor(uri: vscodeTypes.Uri) {
      this.uri = uri;
    }
  },
  TabInputCustom: class TabInputCustom {
    uri: vscodeTypes.Uri;
    viewType: string;
    constructor(uri: vscodeTypes.Uri, viewType: string) {
      this.uri = uri;
      this.viewType = viewType;
    }
  },
  TabInputNotebook: class TabInputNotebook {
    uri: vscodeTypes.Uri;
    notebookType: string;
    constructor(uri: vscodeTypes.Uri, notebookType: string) {
      this.uri = uri;
      this.notebookType = notebookType;
    }
  },
  TabInputTextDiff: class TabInputTextDiff {
    original: vscodeTypes.Uri;
    modified: vscodeTypes.Uri;
    constructor(original: vscodeTypes.Uri, modified: vscodeTypes.Uri) {
      this.original = original;
      this.modified = modified;
    }
  },
  TabInputNotebookDiff: class TabInputNotebookDiff {
    original: vscodeTypes.Uri;
    modified: vscodeTypes.Uri;
    notebookType: string;
    constructor(original: vscodeTypes.Uri, modified: vscodeTypes.Uri, notebookType: string) {
      this.original = original;
      this.modified = modified;
      this.notebookType = notebookType;
    }
  },
  TabInputWebview: class TabInputWebview {
    viewType: string;
    constructor(viewType: string) {
      this.viewType = viewType;
    }
  },
  window: {
    get activeTextEditor() {
      return mocks.activeTextEditor;
    },

    onDidChangeActiveTextEditor: (listener: ActiveEditorListener) => {
      mocks.activeEditorListeners.push(listener);
      return { dispose: vi.fn() };
    },

    onDidChangeTextEditorSelection: (listener: SelectionListener) => {
      mocks.selectionListeners.push(listener);
      return { dispose: vi.fn() };
    },

    tabGroups: {
      get activeTabGroup() {
        return { activeTab: mocks.activeTab };
      },
      onDidChangeTabs: (listener: TabListener) => {
        mocks.tabListeners.push(listener);
        return { dispose: vi.fn() };
      },
      onDidChangeTabGroups: (listener: TabListener) => {
        mocks.tabGroupListeners.push(listener);
        return { dispose: vi.fn() };
      },
    },
  },
}));

describe("registerNotesPreviewEvents()", () => {
  beforeEach(() => {
    mocks.activeTextEditor = undefined;
    mocks.activeEditorListeners.length = 0;
    mocks.selectionListeners.length = 0;
    mocks.tabListeners.length = 0;
    mocks.tabGroupListeners.length = 0;
    mocks.activeTab = undefined;
  });

  it("loads the active file when preview events are registered", () => {
    const uri = createUri("file", "/workspace/src/index.ts");
    const provider = createProvider();
    const context = createExtensionContext();

    mocks.activeTextEditor = createEditor(uri, 3);

    registerNotesPreviewEvents(context, provider.value);

    expect(provider.showActiveDocumentNotes).toHaveBeenCalledWith(uri, 4);
    expect(context.subscriptions).toHaveLength(4);
  });

  it("updates the preview when the active file changes", () => {
    const uri = createUri("file", "/workspace/src/app.ts");
    const provider = createProvider();

    registerNotesPreviewEvents(createExtensionContext(), provider.value);
    mocks.activeEditorListeners[0]?.(createEditor(uri, 6));

    expect(provider.showActiveDocumentNotes).toHaveBeenCalledOnce();
    expect(provider.showActiveDocumentNotes).toHaveBeenCalledWith(uri, 7);
  });

  it("updates once when the active cursor moves to another line", () => {
    const uri = createUri("file", "/workspace/src/app.ts");
    const provider = createProvider();
    const editor = createEditor(uri, 4);

    mocks.activeTextEditor = editor;
    registerNotesPreviewEvents(createExtensionContext(), provider.value);

    const movedEditor = createEditor(uri, 8);
    mocks.activeTextEditor = movedEditor;
    mocks.selectionListeners[0]?.({ textEditor: movedEditor } as vscodeTypes.TextEditorSelectionChangeEvent);
    mocks.selectionListeners[0]?.({ textEditor: movedEditor } as vscodeTypes.TextEditorSelectionChangeEvent);

    expect(provider.showActiveDocumentNotes).toHaveBeenCalledTimes(2);
    expect(provider.showActiveDocumentNotes).toHaveBeenLastCalledWith(uri, 9);
  });

  it("ignores editors that do not represent file resources", () => {
    const provider = createProvider();

    registerNotesPreviewEvents(createExtensionContext(), provider.value);
    mocks.activeEditorListeners[0]?.(createEditor(createUri("untitled", "Untitled-1"), 0));

    expect(provider.showActiveDocumentNotes).not.toHaveBeenCalled();
  });

  it("loads an image URI from the active custom editor tab", () => {
    const uri = createUri("file", "/workspace/assets/image.png");
    const provider = createProvider();
    mocks.activeTab = createTab(new vscode.TabInputCustom(uri, "imagePreview.previewEditor"));

    registerNotesPreviewEvents(createExtensionContext(), provider.value);

    expect(provider.showActiveDocumentNotes).toHaveBeenCalledWith(uri, undefined);
  });

  it("follows the active tab when the active editor group changes", () => {
    const uri = createUri("file", "/workspace/assets/image.png");
    const provider = createProvider();
    registerNotesPreviewEvents(createExtensionContext(), provider.value);
    mocks.activeTab = createTab(new vscode.TabInputCustom(uri, "imagePreview.previewEditor"));

    mocks.tabGroupListeners[0]?.();

    expect(provider.showActiveDocumentNotes).toHaveBeenCalledOnce();
    expect(provider.showActiveDocumentNotes).toHaveBeenCalledWith(uri, undefined);
  });

  it("prefers the text editor line and deduplicates the matching tab event", () => {
    const uri = createUri("file", "/workspace/src/index.ts");
    const provider = createProvider();
    const editor = createEditor(uri, 5);
    mocks.activeTextEditor = editor;
    mocks.activeTab = createTab(new vscode.TabInputText(uri));

    registerNotesPreviewEvents(createExtensionContext(), provider.value);
    mocks.tabListeners[0]?.();

    expect(provider.showActiveDocumentNotes).toHaveBeenCalledOnce();
    expect(provider.showActiveDocumentNotes).toHaveBeenCalledWith(uri, 6);
  });

  it("keeps the current preview for tabs without a resource URI", () => {
    const provider = createProvider();
    mocks.activeTab = createTab(new vscode.TabInputWebview("settings"));

    registerNotesPreviewEvents(createExtensionContext(), provider.value);

    expect(provider.showActiveDocumentNotes).not.toHaveBeenCalled();
  });
});

/**
 * Creates the minimum extension context required by event registration.
 *
 * @returns Mock extension context with subscriptions.
 */
function createExtensionContext(): vscodeTypes.ExtensionContext {
  return {
    subscriptions: [],
  } as unknown as vscodeTypes.ExtensionContext;
}

/**
 * Creates a notes provider mock and exposes its active-document method.
 *
 * @returns Provider mock used by event registration tests.
 */
function createProvider(): {
  value: NotesViewProvider;
  showActiveDocumentNotes: ReturnType<typeof vi.fn>;
} {
  const showActiveDocumentNotes = vi.fn().mockResolvedValue(undefined);

  return {
    value: { showActiveDocumentNotes } as unknown as NotesViewProvider,
    showActiveDocumentNotes,
  };
}

/**
 * Creates the minimum text editor shape required by preview events.
 *
 * @param uri - Document URI exposed by the editor.
 * @returns Mock text editor.
 */
function createEditor(uri: vscodeTypes.Uri, zeroBasedLine: number): vscodeTypes.TextEditor {
  return {
    document: { uri },
    selection: {
      active: {
        line: zeroBasedLine,
        character: 0,
      },
    },
  } as vscodeTypes.TextEditor;
}

function createTab(input: unknown): vscodeTypes.Tab {
  return { input, isActive: true } as vscodeTypes.Tab;
}

/**
 * Creates the minimum URI shape required by preview events.
 *
 * @param scheme - URI scheme.
 * @param fsPath - File-system path or untitled document identifier.
 * @returns Mock VS Code URI.
 */
function createUri(scheme: string, fsPath: string): vscodeTypes.Uri {
  return {
    scheme,
    fsPath,
    toString: () => `${scheme}:${fsPath}`,
  } as vscodeTypes.Uri;
}
