/**
 * Validates, orders, and detects conflicts among source splices from one event.
 */

import type { SourceChangeSplice } from "./sourceChangeAnchorTransform";

/** Pair of source changes whose pre-change ranges overlap. */
export type OverlappingSourceChangePair = {
  /** Original array index of the first overlapping splice. */
  firstIndex: number;
  /** Original array index of the second overlapping splice. */
  secondIndex: number;
};

/**
 * Sorts source splices from later positions to earlier positions.
 *
 * @param splices - Source splices reported for one document change event.
 * @returns A new array ordered from the latest source position to the earliest.
 */
export function sortSourceChangesForApplication(
  splices: readonly SourceChangeSplice[],
): SourceChangeSplice[] {
  return [...splices].sort(
    (left, right) =>
      right.startLine - left.startLine ||
      right.startCharacter - left.startCharacter ||
      right.endLine - left.endLine ||
      right.endCharacter - left.endCharacter,
  );
}

/**
 * Checks whether a normalized splice contains internally consistent coordinates.
 *
 * @param splice - Normalized source splice to validate.
 * @returns True when positions and derived line counts are valid.
 */
export function isValidSourceChangeSplice(splice: SourceChangeSplice): boolean {
  const startsBeforeOrAtEnd =
    splice.startLine < splice.endLine ||
    (splice.startLine === splice.endLine &&
      splice.startCharacter <= splice.endCharacter);

  return (
    splice.startLine >= 0 &&
    splice.startCharacter >= 0 &&
    splice.endLine >= 0 &&
    splice.endCharacter >= 0 &&
    startsBeforeOrAtEnd &&
    splice.insertedLineCount >= 0 &&
    splice.deletedLineCount === splice.endLine - splice.startLine &&
    splice.lineDelta === splice.insertedLineCount - splice.deletedLineCount
  );
}

/**
 * Finds the first pair of source changes whose pre-change ranges overlap.
 *
 * @param splices - Source splices based on the same pre-change document.
 * @returns Original indexes of the first overlap, or undefined when disjoint.
 */
export function findOverlappingSourceChanges(
  splices: readonly SourceChangeSplice[],
): OverlappingSourceChangePair | undefined {
  for (let firstIndex = 0; firstIndex < splices.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < splices.length; secondIndex += 1) {
      if (sourceChangeSplicesOverlap(splices[firstIndex]!, splices[secondIndex]!)) {
        return { firstIndex, secondIndex };
      }
    }
  }

  return undefined;
}

/**
 * Checks whether a batch contains multiple insertions at exactly one position.
 *
 * @param splices - Source splices based on the same pre-change document.
 * @returns True when at least two zero-width insertions share a position.
 */
export function hasSamePositionInsertions(
  splices: readonly SourceChangeSplice[],
): boolean {
  return splices.some(
    (splice, index) =>
      isInsertion(splice) &&
      splices.slice(index + 1).some(
        (candidate) =>
          isInsertion(candidate) &&
          comparePositions(
            splice.startLine,
            splice.startCharacter,
            candidate.startLine,
            candidate.startCharacter,
          ) === 0,
      ),
  );
}

/**
 * Checks whether two pre-change source ranges overlap.
 *
 * @param left - First normalized source splice.
 * @param right - Second normalized source splice.
 * @returns True when the ranges cannot be applied independently.
 */
function sourceChangeSplicesOverlap(
  left: SourceChangeSplice,
  right: SourceChangeSplice,
): boolean {
  if (isInsertion(left) && isInsertion(right)) {
    return false;
  }

  if (isInsertion(left)) {
    return positionFallsInsideRange(left.startLine, left.startCharacter, right);
  }

  if (isInsertion(right)) {
    return positionFallsInsideRange(right.startLine, right.startCharacter, left);
  }

  return (
    comparePositions(
      left.startLine,
      left.startCharacter,
      right.endLine,
      right.endCharacter,
    ) < 0 &&
    comparePositions(
      right.startLine,
      right.startCharacter,
      left.endLine,
      left.endCharacter,
    ) < 0
  );
}

/**
 * Checks whether a source position falls inside an end-exclusive splice range.
 *
 * @param line - Zero-based source line.
 * @param character - Zero-based source character.
 * @param splice - Non-empty splice range.
 * @returns True when the position is within the replacement range.
 */
function positionFallsInsideRange(
  line: number,
  character: number,
  splice: SourceChangeSplice,
): boolean {
  return (
    comparePositions(line, character, splice.startLine, splice.startCharacter) >= 0 &&
    comparePositions(line, character, splice.endLine, splice.endCharacter) < 0
  );
}

/**
 * Checks whether a splice represents a zero-width insertion.
 *
 * @param splice - Normalized source splice.
 * @returns True when the splice replaces no pre-change text.
 */
function isInsertion(splice: SourceChangeSplice): boolean {
  return (
    splice.startLine === splice.endLine &&
    splice.startCharacter === splice.endCharacter &&
    splice.deletedLineCount === 0
  );
}

/**
 * Compares two zero-based source positions.
 *
 * @param leftLine - First position line.
 * @param leftCharacter - First position character.
 * @param rightLine - Second position line.
 * @param rightCharacter - Second position character.
 * @returns Negative, zero, or positive according to source order.
 */
function comparePositions(
  leftLine: number,
  leftCharacter: number,
  rightLine: number,
  rightCharacter: number,
): number {
  return leftLine - rightLine || leftCharacter - rightCharacter;
}
