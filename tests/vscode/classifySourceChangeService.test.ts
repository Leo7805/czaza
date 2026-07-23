/**
 * Unit tests for deterministic text document change classification.
 */

import { describe, expect, it } from "vitest";
import {
  classifySourceChange,
  classifySourceChangeBatch,
  type TextDocumentContentChange,
} from "@vscode/services/noteRelocation/sourceChanges/classifySourceChangeService";

describe("classifySourceChange()", () => {
  it("classifies pure line insertion", () => {
    expect(
      classifySourceChange({
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
      kind: "splice",
      splice: {
        startLine: 4,
        startCharacter: 0,
        endLine: 4,
        endCharacter: 0,
        insertedLineCount: 2,
        deletedLineCount: 0,
        lineDelta: 2,
      },
    });
  });

  it("classifies pure line deletion", () => {
    expect(
      classifySourceChange({
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
      kind: "splice",
      splice: {
        startLine: 2,
        startCharacter: 0,
        endLine: 5,
        endCharacter: 0,
        insertedLineCount: 0,
        deletedLineCount: 3,
        lineDelta: -3,
      },
    });
  });

  it("classifies single-line edits that do not change line count", () => {
    expect(
      classifySourceChange({
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
      kind: "splice",
      splice: {
        startLine: 7,
        startCharacter: 10,
        endLine: 7,
        endCharacter: 14,
        insertedLineCount: 0,
        deletedLineCount: 0,
        lineDelta: 0,
      },
    });
  });

  it("reports empty changes as unsupported", () => {
    expect(classifySourceChange({ contentChanges: [] })).toEqual({
      kind: "unsupported",
      reason: "emptyChange",
    });
  });

  it("reports multiple changes as unsupported", () => {
    expect(
      classifySourceChange({
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

  it("reports no-op changes as unsupported", () => {
    expect(
      classifySourceChange({
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
      reason: "emptyChange",
    });
  });

  it("normalizes a Copilot-style replacement that inserts multiple lines", () => {
    expect(
      classifySourceChange({
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
      kind: "splice",
      splice: {
        startLine: 1,
        startCharacter: 0,
        endLine: 3,
        endCharacter: 0,
        insertedLineCount: 2,
        deletedLineCount: 2,
        lineDelta: 0,
      },
    });
  });
});

describe("classifySourceChangeBatch()", () => {
  it("normalizes and sorts independent changes as one atomic batch", () => {
    const result = classifySourceChangeBatch({
      contentChanges: [
        createChange({
          startLine: 2,
          endLine: 2,
          rangeLength: 0,
          text: "first\n",
        }),
        createChange({
          startLine: 10,
          startCharacter: 4,
          endLine: 10,
          endCharacter: 8,
          rangeLength: 4,
          text: "replacement\nwith lines\n",
        }),
      ],
    });

    expect(result.kind).toBe("splices");
    if (result.kind !== "splices") {
      return;
    }

    expect(result.splices.map((splice) => splice.startLine)).toEqual([10, 2]);
    expect(result.requiresConfirmation).toBe(false);
  });

  it("marks same-position insertions as requiring confirmation", () => {
    const result = classifySourceChangeBatch({
      contentChanges: [
        createChange({
          startLine: 5,
          startCharacter: 3,
          endLine: 5,
          endCharacter: 3,
          rangeLength: 0,
          text: "first",
        }),
        createChange({
          startLine: 5,
          startCharacter: 3,
          endLine: 5,
          endCharacter: 3,
          rangeLength: 0,
          text: "second\n",
        }),
      ],
    });

    expect(result).toMatchObject({
      kind: "splices",
      requiresConfirmation: true,
    });
  });

  it("rejects overlapping replacements for the whole batch", () => {
    expect(
      classifySourceChangeBatch({
        contentChanges: [
          createChange({
            startLine: 2,
            startCharacter: 2,
            endLine: 4,
            endCharacter: 8,
            rangeLength: 20,
            text: "first",
          }),
          createChange({
            startLine: 4,
            startCharacter: 7,
            endLine: 5,
            endCharacter: 3,
            rangeLength: 8,
            text: "second",
          }),
        ],
      }),
    ).toEqual({
      kind: "unsupported",
      reason: "overlappingChanges",
    });
  });

  it("rejects invalid coordinates for the whole batch", () => {
    expect(
      classifySourceChangeBatch({
        contentChanges: [
          createChange({
            startLine: 4,
            endLine: 2,
            rangeLength: 4,
            text: "invalid",
          }),
        ],
      }),
    ).toEqual({
      kind: "unsupported",
      reason: "invalidChange",
    });
  });
});

/**
 * Creates a minimal VS Code content change for classification tests.
 *
 * @param input - Source range, replaced length, and replacement text.
 * @returns Complete text document content change.
 */
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
