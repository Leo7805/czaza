/**
 * Unit tests for deterministic text document change classification.
 */

import { describe, expect, it } from "vitest";
import {
  classifyTextDocumentChange,
  type TextDocumentContentChange,
} from "@vscode/services/textDocumentChanges/classifyTextDocumentChangeService";

describe("classifyTextDocumentChange()", () => {
  it("classifies pure line insertion", () => {
    expect(
      classifyTextDocumentChange({
        contentChanges: [
          createChange({
            startLine: 4,
            startCharacter: 0,
            endLine: 4,
            endCharacter: 0,
            rangeLength: 0,
            text: "const a = 1;\nconst b = 2;\n",
          }),
        ],
      }),
    ).toEqual({
      kind: "insertLines",
      startLine: 5,
      lineCount: 2,
    });
  });

  it("classifies pure line deletion", () => {
    expect(
      classifyTextDocumentChange({
        contentChanges: [
          createChange({
            startLine: 2,
            startCharacter: 0,
            endLine: 5,
            endCharacter: 0,
            rangeLength: 42,
            text: "",
          }),
        ],
      }),
    ).toEqual({
      kind: "deleteLines",
      startLine: 3,
      endLine: 5,
      lineCount: 3,
    });
  });

  it("classifies single-line edits that do not change line count", () => {
    expect(
      classifyTextDocumentChange({
        contentChanges: [
          createChange({
            startLine: 7,
            startCharacter: 10,
            endLine: 7,
            endCharacter: 14,
            rangeLength: 4,
            text: "next",
          }),
        ],
      }),
    ).toEqual({
      kind: "editLine",
      line: 8,
    });
  });

  it("reports empty changes as unsupported", () => {
    expect(classifyTextDocumentChange({ contentChanges: [] })).toEqual({
      kind: "unsupported",
      reason: "emptyChange",
    });
  });

  it("reports multiple changes as unsupported", () => {
    expect(
      classifyTextDocumentChange({
        contentChanges: [
          createChange({ startLine: 0, endLine: 0, text: "a", rangeLength: 0 }),
          createChange({ startLine: 1, endLine: 1, text: "b", rangeLength: 0 }),
        ],
      }),
    ).toEqual({
      kind: "unsupported",
      reason: "multipleChanges",
    });
  });

  it("reports no-op line-neutral changes as unsupported", () => {
    expect(
      classifyTextDocumentChange({
        contentChanges: [
          createChange({
            startLine: 1,
            startCharacter: 0,
            endLine: 1,
            endCharacter: 0,
            rangeLength: 0,
            text: "",
          }),
        ],
      }),
    ).toEqual({
      kind: "unsupported",
      reason: "noLineChange",
    });
  });

  it("reports mixed multi-line replacements as unsupported", () => {
    expect(
      classifyTextDocumentChange({
        contentChanges: [
          createChange({
            startLine: 1,
            startCharacter: 0,
            endLine: 3,
            endCharacter: 0,
            rangeLength: 20,
            text: "replacement\ntext\n",
          }),
        ],
      }),
    ).toEqual({
      kind: "unsupported",
      reason: "mixedChange",
    });
  });
});

function createChange({
  startLine,
  startCharacter = 0,
  endLine,
  endCharacter = 0,
  rangeLength,
  text,
}: {
  startLine: number;
  startCharacter?: number;
  endLine: number;
  endCharacter?: number;
  rangeLength: number;
  text: string;
}): TextDocumentContentChange {
  return {
    range: {
      start: {
        line: startLine,
        character: startCharacter,
      },
      end: {
        line: endLine,
        character: endCharacter,
      },
    },
    rangeLength,
    text,
  };
}
