import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activeEditor: undefined as vscodeTypes.TextEditor | undefined,
  setDecorations: vi.fn(),
  disposeDecoration: vi.fn(),
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
  window: {
    get activeTextEditor() {
      return mocks.activeEditor;
    },
    visibleTextEditors: [],
    createTextEditorDecorationType: (options: unknown) => ({
      options,
      dispose: mocks.disposeDecoration,
    }),
  },
}));

import { NotesEditorHighlightController } from "@vscode/notesUi/highlights/NotesEditorHighlightController";

describe("NotesEditorHighlightController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeEditor = undefined;
  });

  it("applies blue Section and yellow content-bearing Line Note highlights", () => {
    const uri = createUri("/workspace/src/index.ts");
    mocks.activeEditor = createEditor(uri);
    const controller = new NotesEditorHighlightController();

    controller.update({
      viewAvailable: true,
      resourceUri: uri,
      selectedSectionId: "section:one",
      payload: {
        kind: "file",
        name: "index.ts",
        relativePath: "src/index.ts",
        aiAction: "generate",
        activeLine: 7,
        sectionNotes: [
          {
            id: "section:one",
            title: "One",
            startLine: 5,
            endLine: 10,
          },
        ],
        lineNote: {
          id: "line:7",
          line: 7,
          userNote: "Important.",
          status: { content: "current", anchor: "confirmed" },
        },
      },
    });

    expect(getRangeForBackground("rgba(78, 161, 255, 0.10)")).toMatchObject({
      startLine: 4,
      endLine: 9,
    });
    expect(getRangeForBackground("rgba(255, 193, 7, 0.14)")).toMatchObject({
      startLine: 6,
      endLine: 6,
    });
  });

  it("clears Line highlighting for empty or orphaned notes and disposes decorations", () => {
    const uri = createUri("/workspace/src/index.ts");
    mocks.activeEditor = createEditor(uri);
    const controller = new NotesEditorHighlightController();

    controller.update({
      viewAvailable: true,
      resourceUri: uri,
      payload: {
        kind: "file",
        name: "index.ts",
        relativePath: "src/index.ts",
        aiAction: "generate",
        activeLine: 7,
        sectionNotes: [],
        lineNote: {
          id: "line:7",
          line: 7,
          userNote: " ",
          status: { content: "current", anchor: "confirmed" },
        },
      },
    });

    expect(getRangeForBackground("rgba(255, 193, 7, 0.14)")).toBeUndefined();

    controller.dispose();

    expect(mocks.disposeDecoration).toHaveBeenCalledTimes(2);
  });
});

function createUri(fsPath: string): vscodeTypes.Uri {
  return {
    scheme: "file",
    fsPath,
    toString: () => `file://${fsPath}`,
  } as vscodeTypes.Uri;
}

function createEditor(uri: vscodeTypes.Uri): vscodeTypes.TextEditor {
  return {
    document: {
      uri,
      lineCount: 100,
      lineAt: (line: number) => ({ text: `line ${line + 1}` }),
    },
    setDecorations: mocks.setDecorations,
  } as unknown as vscodeTypes.TextEditor;
}

function getRangeForBackground(backgroundColor: string): Record<string, number> | undefined {
  const call = mocks.setDecorations.mock.calls.find(
    ([decorationType]) =>
      (decorationType as { options?: { backgroundColor?: string } }).options?.backgroundColor ===
      backgroundColor,
  );

  return (call?.[1] as Array<Record<string, number>> | undefined)?.[0];
}
