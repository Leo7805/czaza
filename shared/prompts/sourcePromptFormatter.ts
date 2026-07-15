/**
 * Formats source code blocks used by structured AI analysis prompts.
 */

import { AI_REQUEST_DEFAULTS } from "@shared/config/aiRequestDefaults";
import {
  createDependencyDirectiveScanState,
  shouldSkipDependencyDirectiveLine,
} from "@shared/services/dependencyDirectiveFilterService";

/**
 * Input used to format a numbered source block for structured prompts.
 */
export type SourcePromptFormatterInput = {
  /** Complete source code to format. */
  sourceCode: string;

  /** VS Code TextDocument.languageId value, when available. */
  programmingLanguage?: string;

  /** Whether dependency directives should be omitted from the prompt source block. */
  skipDependencyDirectives?: boolean;
};

/**
 * Formats source code with one-based line number prefixes for structured analysis.
 *
 * When dependency filtering is enabled, skipped lines are omitted from the
 * prompt block while the remaining lines keep their original source line
 * numbers. This keeps AI section ranges aligned with the real file.
 *
 * @param input - Source code, optional language id, and dependency filtering override.
 * @returns Numbered source code ready to embed in an AI prompt.
 *
 * @example
 * const source = formatSourceCodeForStructuredAnalysisPrompt({
 *   sourceCode: "import value from './value';\nrun(value);",
 *   programmingLanguage: "typescript",
 *   skipDependencyDirectives: true,
 * });
 */
export function formatSourceCodeForStructuredAnalysisPrompt(
  input: SourcePromptFormatterInput,
): string {
  const skipDependencyDirectives =
    input.skipDependencyDirectives ??
    AI_REQUEST_DEFAULTS.lineAnalysis.skipDependencyDirectives.enabled;
  const dependencyState = createDependencyDirectiveScanState();

  return input.sourceCode
    .split(/\r?\n/)
    .flatMap((line, index) => {
      const trimmed = line.trim();

      if (
        skipDependencyDirectives &&
        shouldSkipDependencyDirectiveLine(
          trimmed,
          input.programmingLanguage,
          dependencyState,
        )
      ) {
        return [];
      }

      return [`${index + 1}: ${line}`];
    })
    .join("\n");
}
