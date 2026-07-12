/**
 * Builds prompts for file-level AI analysis.
 */

import {
  COMMON_AI_NOTES_RULES,
  COMMON_ANALYSIS_STYLE_RULES,
  COMMON_CODE_REFERENCE_RULES,
  COMMON_JSON_OUTPUT_RULES,
} from "./commonPrompt";

/**
 * Input required to build a file-level AI analysis prompt.
 */
export type ExplainFilePromptInput = {
  /** Complete source code for the file being analyzed. */
  sourceCode: string;

  /** Workspace-relative or absolute path used only as prompt context. */
  filePath: string;

  /** VS Code TextDocument.languageId value, when available. */
  programmingLanguage?: string;

  /** Instruction resolved from the user's VS Code AI response language setting. */
  responseLanguageInstruction: string;
};

/**
 * Creates a prompt that asks the AI to return only the file analysis DTO.
 *
 * @param input - Source file context and response-language instruction.
 * @returns Prompt text for a file-only AI request.
 *
 * @example
 * const prompt = explainFilePrompt({
 *   sourceCode: "export const value = 1;",
 *   filePath: "src/value.ts",
 *   programmingLanguage: "typescript",
 *   responseLanguageInstruction: "Respond in English.",
 * });
 */
export function explainFilePrompt(input: ExplainFilePromptInput): string {
  return `
You are explaining one source file for CZaza, an IDE code understanding tool.

${input.responseLanguageInstruction}

Return only a stable JSON object matching the file analysis DTO.
Do not return section analysis, line analysis, token analysis, markdown, or extra text.

Context:
- filePath: ${input.filePath}
- VS Code language id: ${input.programmingLanguage ?? "unknown"}

Required JSON shape:
{
  "summary": "",
  "detail": "",
  "aiNotes": []
}

Field rules:
- summary must be concise and explain the file's primary responsibility.
- detail must explain the file's purpose, important behavior, and relevant context.
${COMMON_JSON_OUTPUT_RULES}
${COMMON_CODE_REFERENCE_RULES}
${COMMON_ANALYSIS_STYLE_RULES}
${COMMON_AI_NOTES_RULES}

Source code:
\`\`\`
${input.sourceCode}
\`\`\`
`;
}
