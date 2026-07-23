/**
 * Computes deterministic Section and Line Note anchor transformations for source splices.
 */

/** One normalized source replacement expressed in pre-change VS Code coordinates. */
export type SourceChangeSplice = {
  /** Zero-based line containing the start of the replaced range. */
  startLine: number;
  /** Zero-based character containing the start of the replaced range. */
  startCharacter: number;
  /** Zero-based line containing the end of the replaced range. */
  endLine: number;
  /** Zero-based character containing the end of the replaced range. */
  endCharacter: number;
  /** Number of line boundaries introduced by replacement text. */
  insertedLineCount: number;
  /** Number of line boundaries removed by the replaced range. */
  deletedLineCount: number;
  /** Net line-count change produced by this splice. */
  lineDelta: number;
};

/** Minimal one-based inclusive Section Note range used by anchor transformation. */
export type SectionAnchorRange = {
  startLine: number;
  endLine: number;
};

/** Deterministic result for one Section Note anchor. */
export type SectionAnchorTransform =
  | { kind: "unchanged"; range: SectionAnchorRange }
  | { kind: "moved"; range: SectionAnchorRange }
  | { kind: "changed"; range: SectionAnchorRange }
  | { kind: "needsConfirmation" }
  | { kind: "orphaned" };

/** Deterministic result for one Line Note anchor. */
export type LineAnchorTransform =
  | { kind: "unchanged"; line: number }
  | { kind: "moved"; line: number }
  | { kind: "changed"; line: number }
  | { kind: "needsConfirmation" }
  | { kind: "orphaned" };

/**
 * Transforms one Section Note range using a normalized source splice.
 *
 * Fully preceding changes move the whole range, insertions inside the range
 * expand it, boundary overlaps require confirmation, and complete coverage
 * orphans the anchor.
 *
 * @param range - Existing one-based inclusive Section Note range.
 * @param splice - Normalized source change in pre-change coordinates.
 * @returns Deterministic Section anchor transformation.
 *
 * @example
 * transformSectionAnchor({ startLine: 10, endLine: 20 }, {
 *   startLine: 4,
 *   startCharacter: 0,
 *   endLine: 4,
 *   endCharacter: 0,
 *   insertedLineCount: 3,
 *   deletedLineCount: 0,
 *   lineDelta: 3,
 * });
 */
export function transformSectionAnchor(
  range: SectionAnchorRange,
  splice: SourceChangeSplice,
): SectionAnchorTransform {
  const sectionStart = range.startLine - 1;
  const sectionEnd = range.endLine - 1;

  if (isLineNeutralReplacement(splice)) {
    if (splice.startLine < sectionStart || splice.startLine > sectionEnd) {
      return { kind: "unchanged", range };
    }

    return { kind: "changed", range };
  }

  if (isInsertion(splice)) {
    if (
      splice.startLine < sectionStart ||
      (splice.startLine === sectionStart && splice.startCharacter === 0)
    ) {
      return {
        kind: "moved",
        range: shiftSectionRange(range, splice.lineDelta),
      };
    }

    if (splice.startLine <= sectionEnd) {
      return {
        kind: "changed",
        range: {
          startLine: range.startLine,
          endLine: range.endLine + splice.lineDelta,
        },
      };
    }

    return { kind: "unchanged", range };
  }

  const touchedEndLine = getTouchedEndLine(splice);

  if (touchedEndLine < sectionStart) {
    return {
      kind: "moved",
      range: shiftSectionRange(range, splice.lineDelta),
    };
  }

  if (splice.startLine > sectionEnd) {
    return { kind: "unchanged", range };
  }

  if (fullyCoversSection(sectionStart, sectionEnd, splice)) {
    return { kind: "orphaned" };
  }

  if (splice.startLine <= sectionStart || touchedEndLine >= sectionEnd) {
    return { kind: "needsConfirmation" };
  }

  return {
    kind: "changed",
    range: {
      startLine: range.startLine,
      endLine: range.endLine + splice.lineDelta,
    },
  };
}

/**
 * Transforms one Line Note number using a normalized source splice.
 *
 * @param line - Existing one-based Line Note number.
 * @param splice - Normalized source change in pre-change coordinates.
 * @returns Deterministic Line Note anchor transformation.
 *
 * @example
 * transformLineAnchor(20, {
 *   startLine: 4,
 *   startCharacter: 0,
 *   endLine: 4,
 *   endCharacter: 0,
 *   insertedLineCount: 3,
 *   deletedLineCount: 0,
 *   lineDelta: 3,
 * });
 */
export function transformLineAnchor(line: number, splice: SourceChangeSplice): LineAnchorTransform {
  const anchorLine = line - 1;

  if (isLineNeutralReplacement(splice)) {
    return splice.startLine === anchorLine
      ? { kind: "changed", line }
      : { kind: "unchanged", line };
  }

  if (isInsertion(splice)) {
    if (
      splice.startLine < anchorLine ||
      (splice.startLine === anchorLine && splice.startCharacter === 0)
    ) {
      return { kind: "moved", line: line + splice.lineDelta };
    }

    if (splice.startLine === anchorLine) {
      return { kind: "needsConfirmation" };
    }

    return { kind: "unchanged", line };
  }

  const touchedEndLine = getTouchedEndLine(splice);

  if (touchedEndLine < anchorLine) {
    return { kind: "moved", line: line + splice.lineDelta };
  }

  if (splice.startLine > anchorLine) {
    return { kind: "unchanged", line };
  }

  return fullyDeletesLine(anchorLine, splice)
    ? { kind: "orphaned" }
    : { kind: "needsConfirmation" };
}

/**
 * Checks whether a splice inserts text without replacing an existing range.
 *
 * @param splice - Normalized source splice.
 * @returns True when the pre-change range is empty.
 */
function isInsertion(splice: SourceChangeSplice): boolean {
  return (
    splice.startLine === splice.endLine &&
    splice.startCharacter === splice.endCharacter &&
    splice.deletedLineCount === 0
  );
}

/**
 * Checks whether a replacement changes source content without changing line count.
 *
 * @param splice - Normalized source splice.
 * @returns True when no line boundaries are inserted or removed.
 */
function isLineNeutralReplacement(splice: SourceChangeSplice): boolean {
  return splice.insertedLineCount === 0 && splice.deletedLineCount === 0;
}

/**
 * Checks whether a replacement provably covers every complete line in a Section.
 *
 * @param sectionStart - Zero-based first Section line.
 * @param sectionEnd - Zero-based last Section line.
 * @param splice - Normalized source splice.
 * @returns True when the pre-change range fully removes the Section lines.
 */
function fullyCoversSection(
  sectionStart: number,
  sectionEnd: number,
  splice: SourceChangeSplice,
): boolean {
  return (
    splice.startLine <= sectionStart && splice.startCharacter === 0 && splice.endLine > sectionEnd
  );
}

/**
 * Checks whether a replacement provably removes the complete Line Note source line.
 *
 * @param anchorLine - Zero-based Line Note source line.
 * @param splice - Normalized source splice.
 * @returns True when the pre-change range fully removes the line.
 */
function fullyDeletesLine(anchorLine: number, splice: SourceChangeSplice): boolean {
  return (
    splice.startLine <= anchorLine && splice.startCharacter === 0 && splice.endLine > anchorLine
  );
}

/**
 * Finds the last old-document line whose content is affected by a replacement.
 *
 * A range ending at character zero excludes that end line because VS Code
 * ranges are end-exclusive.
 *
 * @param splice - Normalized source splice.
 * @returns Zero-based last touched source line.
 */
function getTouchedEndLine(splice: SourceChangeSplice): number {
  return splice.endCharacter === 0 && splice.endLine > splice.startLine
    ? splice.endLine - 1
    : splice.endLine;
}

/**
 * Moves both Section boundaries by a net source line delta.
 *
 * @param range - Existing one-based inclusive range.
 * @param lineDelta - Net inserted or deleted line count.
 * @returns Shifted Section range.
 */
function shiftSectionRange(range: SectionAnchorRange, lineDelta: number): SectionAnchorRange {
  return {
    startLine: range.startLine + lineDelta,
    endLine: range.endLine + lineDelta,
  };
}
