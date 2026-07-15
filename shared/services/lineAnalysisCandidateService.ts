/**
 * Selects source lines that are meaningful candidates for batch AI line notes.
 */

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
};

type ScanState = {
  inBlockComment: boolean;
  inImportContinuation: boolean;
  importParenthesisDepth: number;
};

/**
 * Selects meaningful source lines before a batch line-analysis AI request.
 *
 * Generic rules remove blank, comment-only, and delimiter-only lines. Optional
 * language rules remove dependency imports for C/C++, C#, and Python without
 * restricting other VS Code language identifiers.
 *
 * @param input - Complete source text and optional VS Code language identifier.
 * @returns Candidate lines with their original one-based line numbers.
 *
 * @example
 * const lines = selectLineAnalysisCandidates({
 *   sourceText: "#include <stdio.h>\nint value = 1;\n}",
 *   programmingLanguage: "c",
 * });
 * // [{ lineNumber: 2, text: "int value = 1;" }]
 */
export function selectLineAnalysisCandidates(
  input: SelectLineAnalysisCandidatesInput,
): LineAnalysisCandidate[] {
  const programmingLanguage = input.programmingLanguage?.toLowerCase();
  const state: ScanState = {
    inBlockComment: false,
    inImportContinuation: false,
    importParenthesisDepth: 0,
  };

  return input.sourceText.split(/\r?\n/).flatMap((text, index) => {
    const trimmed = text.trim();

    if (!trimmed || isCommentOnlyLine(trimmed, programmingLanguage, state)) {
      return [];
    }

    if (shouldSkipLanguageSpecificLine(trimmed, programmingLanguage, state)) {
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

/**
 * Applies only the import rule associated with the active VS Code language id.
 */
function shouldSkipLanguageSpecificLine(
  text: string,
  programmingLanguage: string | undefined,
  state: ScanState,
): boolean {
  if (state.inImportContinuation) {
    updateImportContinuation(text, state);
    return true;
  }

  if ((programmingLanguage === "c" || programmingLanguage === "cpp") && isCInclude(text)) {
    updateImportContinuation(text, state);
    return true;
  }

  if (programmingLanguage === "csharp" && isCSharpUsingDirective(text)) {
    return true;
  }

  if (programmingLanguage === "python" && isPythonImport(text)) {
    updateImportContinuation(text, state);
    return true;
  }

  return false;
}

/** Detects a C or C++ include directive. */
function isCInclude(text: string): boolean {
  return /^#\s*include\b/.test(text);
}

/** Detects a C# namespace import without matching a using statement or declaration. */
function isCSharpUsingDirective(text: string): boolean {
  return /^(?:global\s+)?using\s+(?:static\s+)?(?:[A-Za-z_]\w*\s*=\s*)?[A-Za-z_]\w*(?:(?:\.|::)[A-Za-z_]\w*)*\s*;\s*(?:\/\/.*)?$/.test(
    text,
  );
}

/** Detects the first line of a Python import statement. */
function isPythonImport(text: string): boolean {
  return /^(?:import\s+\S|from\s+\S+\s+import\b)/.test(text);
}

/** Updates parenthesis and backslash continuation state for a skipped import. */
function updateImportContinuation(text: string, state: ScanState): void {
  const openingParentheses = countCharacter(text, "(");
  const closingParentheses = countCharacter(text, ")");

  state.importParenthesisDepth = Math.max(
    0,
    state.importParenthesisDepth + openingParentheses - closingParentheses,
  );
  state.inImportContinuation = state.importParenthesisDepth > 0 || /\\\s*$/.test(text);
}

/** Counts occurrences of one character in source text. */
function countCharacter(text: string, target: string): number {
  return [...text].filter((character) => character === target).length;
}
