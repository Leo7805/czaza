/**
 * Selects source lines that are meaningful candidates for batch AI line notes.
 */

import {
  createDependencyDirectiveScanState,
  shouldSkipDependencyDirectiveLine,
  type DependencyDirectiveScanState,
} from "@shared/services/dependencyDirectiveFilterService";

/**
 * One source line selected for batch AI analysis.
 */
export type LineAnalysisCandidate = {
  /** One-based source line number. */
  lineNumber: number;

  /** Original source text without a line-ending character. */
  text: string;
};

/**
 * Input used to select line-analysis candidates.
 */
export type SelectLineAnalysisCandidatesInput = {
  /** Complete source text used to preserve original line numbers. */
  sourceText: string;

  /** VS Code TextDocument.languageId value, when available. */
  programmingLanguage?: string;

  /** Whether dependency directives are skipped for this selection. Defaults to `false`. */
  skipDependencyDirectives?: boolean;
};

type ScanState = {
  inBlockComment: boolean;
  dependencyDirectives: DependencyDirectiveScanState;
};

/**
 * Selects meaningful source lines before a batch line-analysis AI request.
 *
 * Generic rules remove blank, comment-only, and delimiter-only lines. Callers
 * that perform structured combination analysis may also enable configured
 * dependency directive filtering.
 *
 * @param input - Complete source text and optional VS Code language identifier.
 * @returns Candidate lines with their original one-based line numbers.
 *
 * @example
 * const lines = selectLineAnalysisCandidates({
 *   sourceText: "#include <stdio.h>\nint value = 1;\n}",
 *   programmingLanguage: "c",
 *   skipDependencyDirectives: true,
 * });
 * // [{ lineNumber: 2, text: "int value = 1;" }]
 */
export function selectLineAnalysisCandidates(
  input: SelectLineAnalysisCandidatesInput,
): LineAnalysisCandidate[] {
  const programmingLanguage = input.programmingLanguage?.toLowerCase();
  const skipDependencyDirectives = input.skipDependencyDirectives ?? false;
  const state: ScanState = {
    inBlockComment: false,
    dependencyDirectives: createDependencyDirectiveScanState(),
  };

  return input.sourceText.split(/\r?\n/).flatMap((text, index) => {
    const trimmed = text.trim();

    if (!trimmed || isCommentOnlyLine(trimmed, programmingLanguage, state)) {
      return [];
    }

    if (
      skipDependencyDirectives &&
      shouldSkipDependencyDirectiveLine(
        trimmed,
        programmingLanguage,
        state.dependencyDirectives,
      )
    ) {
      return [];
    }

    if (isDelimiterOnlyLine(trimmed)) {
      return [];
    }

    return [{ lineNumber: index + 1, text }];
  });
}

/**
 * Detects comment-only text while tracking C-style block comments across lines.
 */
function isCommentOnlyLine(
  text: string,
  programmingLanguage: string | undefined,
  state: ScanState,
): boolean {
  let remaining = text;
  let containsCode = false;

  while (remaining) {
    if (state.inBlockComment) {
      const commentEnd = remaining.indexOf("*/");

      if (commentEnd === -1) {
        return !containsCode;
      }

      state.inBlockComment = false;
      remaining = remaining.slice(commentEnd + 2).trimStart();
      continue;
    }

    if (startsWithLineComment(remaining, programmingLanguage)) {
      return !containsCode;
    }

    const commentStart = remaining.indexOf("/*");

    if (commentStart === -1) {
      return false;
    }

    containsCode ||= remaining.slice(0, commentStart).trim().length > 0;
    const commentEnd = remaining.indexOf("*/", commentStart + 2);

    if (commentEnd === -1) {
      state.inBlockComment = true;
      return !containsCode;
    }

    remaining = remaining.slice(commentEnd + 2).trimStart();
  }

  return !containsCode;
}

/**
 * Checks single-line comment markers that are safe for the active language.
 */
function startsWithLineComment(text: string, programmingLanguage: string | undefined): boolean {
  if (text.startsWith("//")) {
    return true;
  }

  return programmingLanguage === "python" && text.startsWith("#");
}

/**
 * Detects lines made entirely from structural delimiters.
 */
function isDelimiterOnlyLine(text: string): boolean {
  const delimiters = "{}[]();,";

  return [...text].every((character) => delimiters.includes(character));
}
