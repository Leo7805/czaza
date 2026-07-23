/**
 * Classifies simple VS Code source changes into deterministic Note relocation updates.
 */

/** Minimal position shape used from VS Code text ranges. */
export type TextDocumentChangePosition = {
  /** Zero-based line number. */
  line: number;

  /** Zero-based character offset. */
  character: number;
};

/** Minimal range shape used from VS Code text document changes. */
export type TextDocumentChangeRange = {
  /** Start position in the pre-change document. */
  start: TextDocumentChangePosition;

  /** End position in the pre-change document. */
  end: TextDocumentChangePosition;

  /** Whether the range is empty. */
  isEmpty?: boolean;
};

/** Minimal content change shape used from VS Code text document changes. */
export type TextDocumentContentChange = {
  /** Pre-change range replaced by this edit. */
  range: TextDocumentChangeRange;

  /** Number of UTF-16 code units replaced by this edit. */
  rangeLength: number;

  /** Replacement text. */
  text: string;
};

/** Minimal text document change event shape required for classification. */
export type TextDocumentChangeInput = {
  /** Content changes reported by VS Code for one document change event. */
  contentChanges: readonly TextDocumentContentChange[];
};

/** Deterministic document changes currently supported by CZaza. */
export type ClassifiedSourceChange =
  | {
      /** Whole-line insertion that does not replace existing text. */
      kind: "insertLines";
      startLine: number;
      lineCount: number;
    }
  | {
      /** Whole-line deletion. */
      kind: "deleteLines";
      startLine: number;
      endLine: number;
      lineCount: number;
    }
  | {
      /** Single-line edit that does not change document line count. */
      kind: "editLine";
      line: number;
    }
  | {
      /** Change cannot be handled deterministically by the first pass. */
      kind: "unsupported";
      reason: "emptyChange" | "multipleChanges" | "mixedChange" | "noLineChange";
    };

/**
 * Classifies one VS Code text document change event.
 *
 * Line numbers in the result are one-based to match stored CZaza note models.
 *
 * @param input - Minimal VS Code text document change event.
 * @returns Deterministic change classification, or unsupported with a reason.
 *
 * @example
 * const change = classifySourceChange({ contentChanges: [contentChange] });
 */
export function classifySourceChange(
  input: TextDocumentChangeInput,
): ClassifiedSourceChange {
  if (input.contentChanges.length === 0) {
    return {
      kind: "unsupported",
      reason: "emptyChange",
    };
  }

  if (input.contentChanges.length > 1) {
    return {
      kind: "unsupported",
      reason: "multipleChanges",
    };
  }

  return classifySourceContentChange(input.contentChanges[0]!);
}

/**
 * Classifies one VS Code text content change.
 *
 * @param change - Single content change from a VS Code text document event.
 * @returns Deterministic change classification, or unsupported with a reason.
 */
export function classifySourceContentChange(
  change: TextDocumentContentChange,
): ClassifiedSourceChange {
  const insertedLineCount = countLineBreaks(change.text);
  const deletedLineCount = change.range.end.line - change.range.start.line;

  if (isPureLineInsertion(change, insertedLineCount)) {
    return {
      kind: "insertLines",
      startLine: change.range.start.line + 1,
      lineCount: insertedLineCount,
    };
  }

  if (isPureLineDeletion(change, deletedLineCount)) {
    return {
      kind: "deleteLines",
      startLine: change.range.start.line + 1,
      endLine: change.range.end.line,
      lineCount: deletedLineCount,
    };
  }

  if (isSingleLineEdit(change, insertedLineCount, deletedLineCount)) {
    return {
      kind: "editLine",
      line: change.range.start.line + 1,
    };
  }

  if (insertedLineCount === 0 && deletedLineCount === 0) {
    return {
      kind: "unsupported",
      reason: "noLineChange",
    };
  }

  return {
    kind: "unsupported",
    reason: "mixedChange",
  };
}

/**
 * Checks whether a content change inserts one or more lines without replacing text.
 *
 * @param change - VS Code content change to inspect.
 * @param insertedLineCount - Number of inserted line boundaries.
 * @returns True when the change matches the supported line-insertion shape.
 */
function isPureLineInsertion(
  change: TextDocumentContentChange,
  insertedLineCount: number,
): boolean {
  return (
    insertedLineCount > 0 &&
    change.rangeLength === 0 &&
    isEmptyRange(change.range)
  );
}

/**
 * Checks whether a content change removes one or more complete source lines.
 *
 * @param change - VS Code content change to inspect.
 * @param deletedLineCount - Number of line boundaries removed by the range.
 * @returns True when the change matches the supported line-deletion shape.
 */
function isPureLineDeletion(
  change: TextDocumentContentChange,
  deletedLineCount: number,
): boolean {
  return (
    deletedLineCount > 0 &&
    change.text === "" &&
    change.range.start.character === 0
  );
}

/**
 * Checks whether a content change edits one line without changing line count.
 *
 * @param change - VS Code content change to inspect.
 * @param insertedLineCount - Number of inserted line boundaries.
 * @param deletedLineCount - Number of deleted line boundaries.
 * @returns True when the change is a supported single-line edit.
 */
function isSingleLineEdit(
  change: TextDocumentContentChange,
  insertedLineCount: number,
  deletedLineCount: number,
): boolean {
  return (
    insertedLineCount === 0 &&
    deletedLineCount === 0 &&
    change.range.start.line === change.range.end.line &&
    (change.rangeLength > 0 || change.text.length > 0)
  );
}

/**
 * Checks whether a VS Code range represents an insertion point.
 *
 * @param range - Pre-change range reported by VS Code.
 * @returns True when the range has no width.
 */
function isEmptyRange(range: TextDocumentChangeRange): boolean {
  return (
    range.isEmpty === true ||
    (range.start.line === range.end.line && range.start.character === range.end.character)
  );
}

/**
 * Counts CRLF, CR, and LF line boundaries in inserted text.
 *
 * @param text - Inserted source text.
 * @returns Number of line boundaries in the text.
 */
function countLineBreaks(text: string): number {
  return text.match(/\r\n|\r|\n/g)?.length ?? 0;
}
