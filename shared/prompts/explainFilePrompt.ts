/**
 * Builds prompts for file-level AI analysis.
 */

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
- aiNotes must be an array of useful extra notes, risks, assumptions, or edge cases. Use [] when there are none.
- Keep code identifiers, API names, file names, and package names unchanged.
- Do not suggest edits unless an aiNote must call out a real risk in the current code.

Source code:
\`\`\`
${input.sourceCode}
\`\`\`
`;
}
