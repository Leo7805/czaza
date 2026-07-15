/**
 * Creates collision-free identifiers for line notes in one stored source file.
 */

/**
 * Creates an available line-note identifier without replacing a relocated note.
 *
 * @param line - Current one-based source line number.
 * @param usedIds - Line-note identifiers already used by the source file.
 * @returns Base line identifier or the first available numbered suffix.
 *
 * @example
 * const id = createAvailableLineNoteId(12, ["line:12"]);
 * // "line:12:note:1"
 */
export function createAvailableLineNoteId(
  line: number,
  usedIds: Iterable<string>,
): string {
  if (!Number.isInteger(line) || line < 1) {
    throw new RangeError("Line note id requires a positive one-based line number.");
  }

  const ids = new Set(usedIds);
  const baseId = `line:${line}`;

  if (!ids.has(baseId)) {
    return baseId;
  }

  let suffix = 1;

  while (ids.has(`${baseId}:note:${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}:note:${suffix}`;
}
