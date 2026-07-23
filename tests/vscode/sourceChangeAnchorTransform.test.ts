/**
 * Unit tests for pure Section and Line Note anchor transformations.
 */

import { describe, expect, it } from "vitest";

import {
  transformLineAnchor,
  transformSectionAnchor,
  type SourceChangeSplice,
} from "@vscode/services/noteRelocation/sourceChanges/sourceChangeAnchorTransform";

describe("sourceChangeAnchorTransform", () => {
  it("moves a Section and Line Note after a preceding Copilot-style replacement", () => {
    const splice = createSplice({
      startLine: 3,
      startCharacter: 4,
      endLine: 3,
      endCharacter: 15,
      insertedLineCount: 6,
      lineDelta: 6,
    });

    expect(transformSectionAnchor({ startLine: 10, endLine: 20 }, splice)).toEqual({
      kind: "moved",
      range: { startLine: 16, endLine: 26 },
    });
    expect(transformLineAnchor(14, splice)).toEqual({
      kind: "moved",
      line: 20,
    });
  });

  it("moves a Section when insertion occurs at its first-line boundary", () => {
    const splice = createSplice({
      startLine: 9,
      insertedLineCount: 2,
      lineDelta: 2,
    });

    expect(transformSectionAnchor({ startLine: 10, endLine: 20 }, splice)).toEqual({
      kind: "moved",
      range: { startLine: 12, endLine: 22 },
    });
  });

  it("expands a Section for insertion inside its range", () => {
    const splice = createSplice({
      startLine: 14,
      startCharacter: 8,
      endLine: 14,
      endCharacter: 8,
      insertedLineCount: 3,
      lineDelta: 3,
    });

    expect(transformSectionAnchor({ startLine: 10, endLine: 20 }, splice)).toEqual({
      kind: "changed",
      range: { startLine: 10, endLine: 23 },
    });
  });

  it("shrinks a Section for deletion fully contained inside its range", () => {
    const splice = createSplice({
      startLine: 12,
      endLine: 15,
      deletedLineCount: 3,
      lineDelta: -3,
    });

    expect(transformSectionAnchor({ startLine: 10, endLine: 20 }, splice)).toEqual({
      kind: "changed",
      range: { startLine: 10, endLine: 17 },
    });
  });

  it("moves anchors upward after a preceding deletion", () => {
    const splice = createSplice({
      startLine: 2,
      endLine: 5,
      deletedLineCount: 3,
      lineDelta: -3,
    });

    expect(transformSectionAnchor({ startLine: 10, endLine: 20 }, splice)).toEqual({
      kind: "moved",
      range: { startLine: 7, endLine: 17 },
    });
    expect(transformLineAnchor(14, splice)).toEqual({
      kind: "moved",
      line: 11,
    });
  });

  it("leaves anchors unchanged when a splice occurs after them", () => {
    const splice = createSplice({
      startLine: 30,
      insertedLineCount: 2,
      lineDelta: 2,
    });

    expect(transformSectionAnchor({ startLine: 10, endLine: 20 }, splice)).toEqual({
      kind: "unchanged",
      range: { startLine: 10, endLine: 20 },
    });
    expect(transformLineAnchor(14, splice)).toEqual({
      kind: "unchanged",
      line: 14,
    });
  });

  it("requires confirmation when deletion overlaps one Section boundary", () => {
    const splice = createSplice({
      startLine: 7,
      endLine: 12,
      deletedLineCount: 5,
      lineDelta: -5,
    });

    expect(transformSectionAnchor({ startLine: 10, endLine: 20 }, splice)).toEqual({
      kind: "needsConfirmation",
    });
  });

  it("requires confirmation when deletion overlaps the Section end boundary", () => {
    const splice = createSplice({
      startLine: 16,
      endLine: 24,
      deletedLineCount: 8,
      lineDelta: -8,
    });

    expect(transformSectionAnchor({ startLine: 10, endLine: 20 }, splice)).toEqual({
      kind: "needsConfirmation",
    });
  });

  it("orphans Section and Line anchors completely covered by deletion", () => {
    const splice = createSplice({
      startLine: 7,
      endLine: 22,
      deletedLineCount: 15,
      lineDelta: -15,
    });

    expect(transformSectionAnchor({ startLine: 10, endLine: 20 }, splice)).toEqual({
      kind: "orphaned",
    });
    expect(transformLineAnchor(14, splice)).toEqual({
      kind: "orphaned",
    });
  });

  it("requires confirmation when insertion splits the Line Note source line", () => {
    const splice = createSplice({
      startLine: 13,
      startCharacter: 6,
      endLine: 13,
      endCharacter: 6,
      insertedLineCount: 2,
      lineDelta: 2,
    });

    expect(transformLineAnchor(14, splice)).toEqual({
      kind: "needsConfirmation",
    });
  });

  it("marks anchors changed for a line-neutral replacement on their source line", () => {
    const splice = createSplice({
      startLine: 13,
      startCharacter: 6,
      endLine: 13,
      endCharacter: 12,
    });

    expect(transformSectionAnchor({ startLine: 10, endLine: 20 }, splice)).toEqual({
      kind: "changed",
      range: { startLine: 10, endLine: 20 },
    });
    expect(transformLineAnchor(14, splice)).toEqual({
      kind: "changed",
      line: 14,
    });
  });

  it("requires confirmation for a partial replacement crossing a Line Note line", () => {
    const splice = createSplice({
      startLine: 12,
      startCharacter: 5,
      endLine: 14,
      endCharacter: 8,
      insertedLineCount: 3,
      deletedLineCount: 2,
      lineDelta: 1,
    });

    expect(transformLineAnchor(14, splice)).toEqual({
      kind: "needsConfirmation",
    });
  });

});

/**
 * Creates a valid splice with concise overrides for individual test cases.
 *
 * @param overrides - Source splice fields that differ from the defaults.
 * @returns Complete normalized source splice.
 */
function createSplice(overrides: Partial<SourceChangeSplice>): SourceChangeSplice {
  return {
    startLine: 0,
    startCharacter: 0,
    endLine: overrides.startLine ?? 0,
    endCharacter: overrides.startCharacter ?? 0,
    insertedLineCount: 0,
    deletedLineCount: 0,
    lineDelta: 0,
    ...overrides,
  };
}
