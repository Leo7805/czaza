/**
 * Builds prompts for single-line AI analysis.
 */

import {
  COMMON_AI_NOTES_RULES,
  COMMON_ANALYSIS_STYLE_RULES,
  COMMON_CODE_REFERENCE_RULES,
  COMMON_JSON_OUTPUT_RULES,
} from "./commonPrompt";

/**
 * Input required to build a single-line AI analysis prompt.
 */
export type ExplainLinePromptInput = {
  /** One-based source line number for the target line. */
  lineNumber: number;

  /** Source text on the target line. */
  sourceLine: string;

  /** Workspace-relative or absolute path used only as prompt context. */
  filePath: string;

  /** VS Code TextDocument.languageId value, when available. */
  programmingLanguage?: string;

  /** Instruction resolved from the user's VS Code AI response language setting. */
  responseLanguageInstruction: string;

  /**
   * Optional surrounding source lines used as context.
   *
   * These lines should include the target line when available.
   */
  surroundingSourceLines?: ReadonlyArray<{
    /** One-based source line number. */
    lineNumber: number;

    /** Source text for the line. */
    text: string;
  }>;
};

/**
 * Creates a prompt that asks the AI to explain one source line.
 *
 * @param input - Target line context and response-language instruction.
 * @returns Prompt text for a single-line AI request.
 *
 * @example
 * const prompt = explainLinePrompt({
 *   lineNumber: 3,
 *   sourceLine: "return <button>Save</button>;",
 *   filePath: "src/Button.tsx",
 *   programmingLanguage: "typescriptreact",
 *   responseLanguageInstruction: "Respond in English.",
 * });
 */
export function explainLinePrompt(input: ExplainLinePromptInput): string {
  return `
You are explaining one source line for CZaza, an IDE code understanding tool.

${input.responseLanguageInstruction}

Return only a stable JSON object matching the line analysis DTO.
Do not return file analysis, section analysis, token analysis, markdown, or extra text.

Context:
- filePath: ${input.filePath}
- VS Code language id: ${input.programmingLanguage ?? "unknown"}
- target line: ${input.lineNumber}

Required JSON shape:
{
  "summary": "",
  "detail": "",
  "aiNotes": []
}

Line rules:
- Explain only the target line.
- Use surrounding source lines only to understand context.
- Do not return the line number or source code in the JSON.
- summary must be concise and explain the target line's immediate responsibility.
- detail must explain how the target line behaves in its local context.
${COMMON_JSON_OUTPUT_RULES}
${COMMON_CODE_REFERENCE_RULES}
${COMMON_ANALYSIS_STYLE_RULES}
${COMMON_AI_NOTES_RULES}

Target source line:
Line numbers are prefixes for reference only and are not part of the source code.
\`\`\`
${formatLine(input.lineNumber, input.sourceLine)}
\`\`\`

Surrounding source lines:
Line numbers are prefixes for reference only and are not part of the source code.
\`\`\`
${formatSurroundingSourceLines(input)}
\`\`\`
`;
}

/**
 * Formats one source line with its one-based line number.
 *
 * @param lineNumber - One-based source line number.
 * @param text - Source text on the line.
 * @returns Line formatted for prompt context.
 *
 * @example
 * const line = formatLine(3, "return value;");
 */
function formatLine(lineNumber: number, text: string): string {
  return `${lineNumber}: ${text}`;
}

/**
 * Formats surrounding source lines for prompt context.
 *
 * @param input - Line prompt input containing optional surrounding lines.
 * @returns Numbered surrounding source lines or the target line when no context is provided.
 *
 * @example
 * const context = formatSurroundingSourceLines({
 *   lineNumber: 1,
 *   sourceLine: "const value = 1;",
 *   filePath: "src/value.ts",
 *   responseLanguageInstruction: "Respond in English.",
 * });
 */
function formatSurroundingSourceLines(input: ExplainLinePromptInput): string {
  const lines =
    input.surroundingSourceLines && input.surroundingSourceLines.length > 0
      ? input.surroundingSourceLines
      : [
          {
            lineNumber: input.lineNumber,
            text: input.sourceLine,
          },
        ];

  return lines.map((line) => formatLine(line.lineNumber, line.text)).join("\n");
}
