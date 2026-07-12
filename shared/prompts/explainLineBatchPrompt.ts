/**
 * Builds prompts for batch line AI analysis.
 */

import {
  COMMON_AI_NOTES_RULES,
  COMMON_ANALYSIS_STYLE_RULES,
  COMMON_CODE_REFERENCE_RULES,
  COMMON_JSON_OUTPUT_RULES,
} from "./commonPrompt";

/**
 * Source line included in a batch line-analysis prompt.
 */
export type ExplainLineBatchPromptLine = {
  /** One-based source line number. */
  lineNumber: number;

  /** Source text for the line. */
  text: string;
};

/**
 * Input required to build a batch line-analysis prompt.
 */
export type ExplainLineBatchPromptInput = {
  /** Lines that should be explained by the AI. */
  sourceLines: ReadonlyArray<ExplainLineBatchPromptLine>;

  /** Workspace-relative or absolute path used only as prompt context. */
  filePath: string;

  /** VS Code TextDocument.languageId value, when available. */
  programmingLanguage?: string;

  /** Instruction resolved from the user's VS Code AI response language setting. */
  responseLanguageInstruction: string;
};

/**
 * Creates a prompt that asks the AI to explain multiple source lines.
 *
 * @param input - Source lines and response-language instruction.
 * @returns Prompt text for a batch line-analysis AI request.
 *
 * @example
 * const prompt = explainLineBatchPrompt({
 *   sourceLines: [
 *     { lineNumber: 2, text: "const label = 'Save';" },
 *     { lineNumber: 3, text: "return <button>{label}</button>;" },
 *   ],
 *   filePath: "src/Button.tsx",
 *   programmingLanguage: "typescriptreact",
 *   responseLanguageInstruction: "Respond in English.",
 * });
 */
export function explainLineBatchPrompt(input: ExplainLineBatchPromptInput): string {
  return `
You are explaining multiple source lines for CZaza, an IDE code understanding tool.

${input.responseLanguageInstruction}

Return only a stable JSON object matching the batch line analysis DTO list.
Do not return file analysis, section analysis, token analysis, markdown, or extra text.

Context:
- filePath: ${input.filePath}
- VS Code language id: ${input.programmingLanguage ?? "unknown"}

Required JSON shape:
{
  "lines": [
    {
      "lineNumber": 1,
      "summary": "",
      "detail": "",
      "aiNotes": []
    }
  ]
}

Line batch rules:
- Explain only the provided source lines.
- Return one lines item for each provided source line that has meaningful code.
- Preserve each provided lineNumber exactly.
- Do not return source code in the JSON.
- summary must be concise and explain the line's immediate responsibility.
- detail must explain how the line behaves in its local context.
${COMMON_JSON_OUTPUT_RULES}
${COMMON_CODE_REFERENCE_RULES}
${COMMON_ANALYSIS_STYLE_RULES}
${COMMON_AI_NOTES_RULES}

Source lines:
Line numbers are prefixes for reference only and are not part of the source code.
\`\`\`
${formatSourceLines(input.sourceLines)}
\`\`\`
`;
}

/**
 * Formats source lines with one-based line number prefixes.
 *
 * @param sourceLines - Source lines included in the batch request.
 * @returns Numbered source lines for prompt context.
 *
 * @example
 * const lines = formatSourceLines([{ lineNumber: 1, text: "const value = 1;" }]);
 */
function formatSourceLines(sourceLines: ReadonlyArray<ExplainLineBatchPromptLine>): string {
  return sourceLines.map((line) => `${line.lineNumber}: ${line.text}`).join("\n");
}
