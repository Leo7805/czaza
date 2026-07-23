/**
 * Unit tests for validating and ordering source-change batches.
 */

import { describe, expect, it } from "vitest";
import {
  findOverlappingSourceChanges,
  hasSamePositionInsertions,
  isValidSourceChangeSplice,
  sortSourceChangesForApplication,
} from "@vscode/services/noteRelocation/sourceChanges/sourceChangeBatchAnalysis";
import type { SourceChangeSplice } from "@vscode/services/noteRelocation/sourceChanges/sourceChangeAnchorTransform";

describe("sourceChangeBatchAnalysis", () => {
  it("sorts independent changes from later positions to earlier positions", () => {
    const early = createSplice({ startLine: 3, startCharacter: 2 });
    const laterCharacter = createSplice({ startLine: 9, startCharacter: 8 });
    const laterLine = createSplice({ startLine: 20 });

    expect(sortSourceChangesForApplication([early, laterLine, laterCharacter])).toEqual([
      laterLine,
      laterCharacter,
      early,
    ]);
  });

  it("validates internally consistent splice coordinates", () => {
    expect(isValidSourceChangeSplice(createSplice({ startLine: -1 }))).toBe(false);
    expect(
      isValidSourceChangeSplice(
        createSplice({ startLine: 4, endLine: 2, deletedLineCount: -2 }),
      ),
    ).toBe(false);
    expect(
      isValidSourceChangeSplice(
        createSplice({ insertedLineCount: 2, lineDelta: 1 }),
      ),
    ).toBe(false);
    expect(isValidSourceChangeSplice(createSplice({ startLine: 4 }))).toBe(true);
  });

  it("finds overlapping replacements but allows adjacent ranges", () => {
    const first = createSplice({
      startLine: 2,
      startCharacter: 4,
      endLine: 4,
      endCharacter: 8,
      deletedLineCount: 2,
      lineDelta: -2,
    });
    const overlapping = createSplice({
      startLine: 4,
      startCharacter: 7,
      endLine: 5,
      endCharacter: 0,
      deletedLineCount: 1,
      lineDelta: -1,
    });
    const adjacent = createSplice({
      startLine: 4,
      startCharacter: 8,
      endLine: 6,
      endCharacter: 0,
      deletedLineCount: 2,
      lineDelta: -2,
    });

    expect(findOverlappingSourceChanges([first, overlapping])).toEqual({
      firstIndex: 0,
      secondIndex: 1,
    });
    expect(findOverlappingSourceChanges([first, adjacent])).toBeUndefined();
  });

  it("detects same-position insertions as a recoverable ambiguity", () => {
    const first = createSplice({ startLine: 5, startCharacter: 3 });
    const second = createSplice({
      startLine: 5,
      startCharacter: 3,
      insertedLineCount: 2,
      lineDelta: 2,
    });

    expect(findOverlappingSourceChanges([first, second])).toBeUndefined();
    expect(hasSamePositionInsertions([first, second])).toBe(true);
  });
});

/**
 * Creates a normalized source splice with concise test overrides.
 *
 * @param overrides - Source splice fields that differ from defaults.
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
