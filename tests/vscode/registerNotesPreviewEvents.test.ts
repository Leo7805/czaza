/**
 * Unit tests for keeping the notes preview synchronized with active editors.
 */

import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerNotesPreviewEvents } from "@vscode/events";
import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";

type ActiveEditorListener = (editor: vscodeTypes.TextEditor | undefined) => void;
type SelectionListener = (event: vscodeTypes.TextEditorSelectionChangeEvent) => void;

const mocks = vi.hoisted(() => ({
  activeTextEditor: undefined as vscodeTypes.TextEditor | undefined,
  activeEditorListeners: [] as ActiveEditorListener[],
  selectionListeners: [] as SelectionListener[],
}));

vi.mock("vscode", () => ({
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
  },
}));

describe("registerNotesPreviewEvents()", () => {
  beforeEach(() => {
    mocks.activeTextEditor = undefined;
    mocks.activeEditorListeners.length = 0;
    mocks.selectionListeners.length = 0;
  });

  it("loads the active file when preview events are registered", () => {
    const uri = createUri("file", "/workspace/src/index.ts");
    const provider = createProvider();
    const context = createExtensionContext();

    mocks.activeTextEditor = createEditor(uri, 3);

    registerNotesPreviewEvents(context, provider.value);

    expect(provider.showActiveDocumentNotes).toHaveBeenCalledWith(uri, 4);
    expect(context.subscriptions).toHaveLength(2);
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
