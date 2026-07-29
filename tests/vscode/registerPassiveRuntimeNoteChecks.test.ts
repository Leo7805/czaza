/**
 * Unit tests for passive Runtime Note checks on opened and active documents.
 */

import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

type OpenDocumentListener = (document: vscodeTypes.TextDocument) => void;
type ActiveEditorListener = (editor: vscodeTypes.TextEditor | undefined) => void;

const mocks = vi.hoisted(() => ({
  activeTextEditor: undefined as vscodeTypes.TextEditor | undefined,
  openListeners: [] as OpenDocumentListener[],
  activeEditorListeners: [] as ActiveEditorListener[],
  passiveCheck: vi.fn(),
}));

vi.mock("vscode", () => ({
  workspace: {
    onDidOpenTextDocument: (listener: OpenDocumentListener) => {
      mocks.openListeners.push(listener);
      return { dispose: vi.fn() };
    },
  },
  window: {
    get activeTextEditor() {
      return mocks.activeTextEditor;
    },
    onDidChangeActiveTextEditor: (listener: ActiveEditorListener) => {
      mocks.activeEditorListeners.push(listener);
      return { dispose: vi.fn() };
    },
  },
}));

vi.mock("@vscode/services/runtimeState", () => ({
  passiveRuntimeNoteCheckService: mocks.passiveCheck,
}));

import type { WorkspaceNoteStore } from "@vscode/notes";
import { registerPassiveRuntimeNoteChecks } from "@vscode/events/registerPassiveRuntimeNoteChecks";
import type { RuntimeNoteStateRegistry } from "@vscode/services/runtimeState/RuntimeNoteStateRegistry";

describe("registerPassiveRuntimeNoteChecks()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeTextEditor = undefined;
    mocks.openListeners.length = 0;
    mocks.activeEditorListeners.length = 0;
    mocks.passiveCheck.mockReset().mockResolvedValue({
      kind: "current",
      registryChange: "none",
    });
  });

  it("checks the active editor once during registration", async () => {
    mocks.activeTextEditor = createEditor(
      createDocument("file:///workspace/src/index.ts", "export {};\n"),
    );

    registerPassiveRuntimeNoteChecks(
      createContext(),
      createNotes(),
      createRegistry(),
    );
    await waitForMicrotasks();

    expect(mocks.passiveCheck).toHaveBeenCalledOnce();
    expect(mocks.passiveCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({
          languageId: "typescript",
        }),
        canApply: expect.any(Function),
      }),
    );
  });

  it("deduplicates open and active-editor events with identical content", async () => {
    const document = createDocument(
      "file:///workspace/src/index.ts",
      "export {};\n",
    );

    registerPassiveRuntimeNoteChecks(
      createContext(),
      createNotes(),
      createRegistry(),
    );
    mocks.openListeners[0]?.(document);
    mocks.activeEditorListeners[0]?.(createEditor(document));
    await waitForMicrotasks();

    expect(mocks.passiveCheck).toHaveBeenCalledOnce();
  });

  it("checks the same resource again after its content hash changes", async () => {
    const first = createDocument(
      "file:///workspace/src/index.ts",
      "export const value = 1;\n",
    );
    const second = createDocument(
      "file:///workspace/src/index.ts",
      "export const value = 2;\n",
    );

    registerPassiveRuntimeNoteChecks(
      createContext(),
      createNotes(),
      createRegistry(),
    );
    mocks.openListeners[0]?.(first);
    await waitForMicrotasks();
    mocks.activeEditorListeners[0]?.(createEditor(second));
    await waitForMicrotasks();

    expect(mocks.passiveCheck).toHaveBeenCalledTimes(2);
  });

  it("skips an older queued snapshot when newer content arrives first", async () => {
    const first = createDocument(
      "file:///workspace/src/index.ts",
      "export const value = 1;\n",
    );
    const second = createDocument(
      "file:///workspace/src/index.ts",
      "export const value = 2;\n",
    );

    registerPassiveRuntimeNoteChecks(
      createContext(),
      createNotes(),
      createRegistry(),
    );
    mocks.openListeners[0]?.(first);
    mocks.activeEditorListeners[0]?.(createEditor(second));
    await waitForMicrotasks();

    expect(mocks.passiveCheck).toHaveBeenCalledOnce();
    expect(
      mocks.passiveCheck.mock.calls[0]?.[0].document.getText(),
    ).toBe("export const value = 2;\n");
  });

  it("ignores non-file documents before scheduling detection", async () => {
    const document = createDocument(
      "untitled:Untitled-1",
      "export {};\n",
      "untitled",
    );

    registerPassiveRuntimeNoteChecks(
      createContext(),
      createNotes(),
      createRegistry(),
    );
    mocks.openListeners[0]?.(document);
    await waitForMicrotasks();

    expect(mocks.passiveCheck).not.toHaveBeenCalled();
  });
});

/**
 * Creates a minimal Extension Context.
 *
 * @returns Mock Extension Context.
 */
function createContext(): vscodeTypes.ExtensionContext {
  return {
    subscriptions: [],
  } as unknown as vscodeTypes.ExtensionContext;
}

/**
 * Creates a minimal persistent Note Store.
 *
 * @returns Mock shared Note Store.
 */
function createNotes(): WorkspaceNoteStore {
  return {} as WorkspaceNoteStore;
}

/**
 * Creates a minimal Runtime Note State Registry.
 *
 * @returns Mock shared Runtime Registry.
 */
function createRegistry(): RuntimeNoteStateRegistry {
  return {} as RuntimeNoteStateRegistry;
}

/**
 * Creates a minimal text document.
 *
 * @param uri - URI string used by the document.
 * @param text - Current source text.
 * @param scheme - URI scheme.
 * @returns Mock text document.
 */
function createDocument(
  uri: string,
  text: string,
  scheme = "file",
): vscodeTypes.TextDocument {
  return {
    uri: {
      scheme,
      fsPath: uri.replace(/^[^:]+:\/\//, ""),
      toString: () => uri,
    },
    languageId: "typescript",
    getText: () => text,
  } as vscodeTypes.TextDocument;
}

/**
 * Creates a minimal text editor for one document.
 *
 * @param document - Document shown by the editor.
 * @returns Mock text editor.
 */
function createEditor(
  document: vscodeTypes.TextDocument,
): vscodeTypes.TextEditor {
  return {
    document,
  } as vscodeTypes.TextEditor;
}

/**
 * Waits for scheduled passive-check promise callbacks.
 *
 * @returns Promise resolved after pending microtasks.
 */
async function waitForMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
