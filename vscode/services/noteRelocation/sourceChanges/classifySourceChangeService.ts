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

import {
  findOverlappingSourceChanges,
  hasSamePositionInsertions,
  isValidSourceChangeSplice,
  sortSourceChangesForApplication,
} from "./sourceChangeBatchAnalysis";
import type { SourceChangeSplice } from "./sourceChangeAnchorTransform";

/** Normalized document changes currently supported by CZaza. */
export type ClassifiedSourceChange =
  | {
      /** One replacement normalized into its pre-change source coordinates. */
      kind: "splice";
      splice: SourceChangeSplice;
    }
  | {
      /** Change cannot yet be applied as one deterministic splice. */
      kind: "unsupported";
      reason: "emptyChange" | "multipleChanges";
    };

/** Atomic classification for every content change in one VS Code event. */
export type ClassifiedSourceChangeBatch =
  | {
      /** Valid non-overlapping splices ordered for deterministic application. */
      kind: "splices";
      splices: SourceChangeSplice[];
      /** Whether same-position insertions require conservative anchor review. */
      requiresConfirmation: boolean;
    }
  | {
      /** The complete event must fall back to the recovery mechanism. */
      kind: "unsupported";
      reason: "emptyChange" | "invalidChange" | "overlappingChanges";
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
 * Classifies all content changes from one VS Code event as an atomic batch.
 *
 * @param input - Minimal VS Code text document change event.
 * @returns Sorted splice batch, or one unsupported result for the whole event.
 *
 * @example
 * const batch = classifySourceChangeBatch({ contentChanges: event.contentChanges });
 */
export function classifySourceChangeBatch(
  input: TextDocumentChangeInput,
): ClassifiedSourceChangeBatch {
  if (input.contentChanges.length === 0) {
    return { kind: "unsupported", reason: "emptyChange" };
  }

  const classified = input.contentChanges.map(classifySourceContentChange);

  if (classified.some((change) => change.kind === "unsupported")) {
    return { kind: "unsupported", reason: "emptyChange" };
  }

  const splices = classified.map(extractSourceChangeSplice);

  if (splices.some((splice) => !isValidSourceChangeSplice(splice))) {
    return { kind: "unsupported", reason: "invalidChange" };
  }

  if (findOverlappingSourceChanges(splices)) {
    return { kind: "unsupported", reason: "overlappingChanges" };
  }

  return {
    kind: "splices",
    splices: sortSourceChangesForApplication(splices),
    requiresConfirmation: hasSamePositionInsertions(splices),
  };
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

  if (change.rangeLength === 0 && change.text.length === 0) {
    return {
      kind: "unsupported",
      reason: "emptyChange",
    };
  }

  return {
    kind: "splice",
    splice: {
      startLine: change.range.start.line,
      startCharacter: change.range.start.character,
      endLine: change.range.end.line,
      endCharacter: change.range.end.character,
      insertedLineCount,
      deletedLineCount,
      lineDelta: insertedLineCount - deletedLineCount,
    },
  };
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

/**
 * Enforces exhaustive handling when extracting successfully classified splices.
 *
 * @param change - Classification that TypeScript could not narrow in an array callback.
 * @returns Never because unsupported entries are filtered before extraction.
 */
function extractSourceChangeSplice(change: ClassifiedSourceChange): SourceChangeSplice {
  if (change.kind === "splice") {
    return change.splice;
  }

  throw new Error(`Unexpected source change classification: ${JSON.stringify(change)}`);
}
