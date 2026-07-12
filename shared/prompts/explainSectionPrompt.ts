/**
 * Builds prompts for section-level AI analysis.
 */

import {
  COMMON_AI_NOTES_RULES,
  COMMON_ANALYSIS_STYLE_RULES,
  COMMON_CODE_REFERENCE_RULES,
  COMMON_JSON_OUTPUT_RULES,
} from "./commonPrompt";

/**
 * Input required to build a section-level AI analysis prompt.
 */
export type ExplainSectionPromptInput = {
  /** Complete source code for the file whose sections should be identified. */
  sourceCode: string;

  /** Workspace-relative or absolute path used only as prompt context. */
  filePath: string;

  /** VS Code TextDocument.languageId value, when available. */
  programmingLanguage?: string;

  /** Instruction resolved from the user's VS Code AI response language setting. */
  responseLanguageInstruction: string;
};

/**
 * Creates a prompt that asks the AI to identify and explain meaningful sections.
 *
 * @param input - Source file context, optional file analysis, and response-language instruction.
 * @returns Prompt text for a section-level AI request.
 *
 * @example
 * const prompt = explainSectionPrompt({
 *   sourceCode: "export function Button() { return <button>Save</button>; }",
 *   filePath: "src/Button.tsx",
 *   programmingLanguage: "typescriptreact",
 *   responseLanguageInstruction: "Respond in English.",
 * });
 */
export function explainSectionPrompt(input: ExplainSectionPromptInput): string {
  return `
You are identifying meaningful sections in one source file for CZaza, an IDE code understanding tool.

${input.responseLanguageInstruction}

Return only a stable JSON object matching the section analysis DTO list.
Do not return file analysis, line analysis, token analysis, markdown, or extra text.

Context:
- filePath: ${input.filePath}
- VS Code language id: ${input.programmingLanguage ?? "unknown"}

Required JSON shape:
{
  "sections": [
    {
      "title": "",
      "kind": "",
      "range": {
        "startLine": 1,
        "endLine": 1
      },
      "summary": "",
      "detail": "",
      "aiNotes": []
    }
  ]
}

Section rules:
- Use 1-based inclusive line numbers.
- Each section must describe a meaningful code region.
- Do not create sections for ordinary single lines unless the whole file is a single meaningful line.
- Sections may align with functions, classes, components, configuration blocks, validation flows, data transformations, rendering regions, or related groups of statements.
- kind should be a short category when useful. Use an empty string when no category is useful.
- summary must be concise and explain the section's primary responsibility.
- detail must explain the section's behavior and important context.
${COMMON_JSON_OUTPUT_RULES}
${COMMON_CODE_REFERENCE_RULES}
${COMMON_ANALYSIS_STYLE_RULES}
${COMMON_AI_NOTES_RULES}

Source code:
Line numbers are prefixes for reference only and are not part of the source code.
\`\`\`
${formatSourceCodeWithLineNumbers(input.sourceCode)}
\`\`\`
`;
}

/**
 * Formats source code with one-based line number prefixes for AI range selection.
 *
 * @param sourceCode - Complete source code to format.
 * @returns Source code where each line is prefixed with its one-based line number.
 *
 * @example
 * const formatted = formatSourceCodeWithLineNumbers("const value = 1;");
 */
function formatSourceCodeWithLineNumbers(sourceCode: string): string {
  return sourceCode
    .split(/\r?\n/)
    .map((line, index) => `${index + 1}: ${line}`)
    .join("\n");
}
