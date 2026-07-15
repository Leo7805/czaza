/**
 * Builds prompts for combined file and section AI analysis.
 */

import {
  COMMON_AI_NOTES_RULES,
  COMMON_ANALYSIS_STYLE_RULES,
  COMMON_CODE_REFERENCE_RULES,
  COMMON_JSON_OUTPUT_RULES,
} from "./commonPrompt";
import { formatSourceCodeForStructuredAnalysisPrompt } from "./sourcePromptFormatter";

/**
 * Input required to build a combined file and section analysis prompt.
 */
export type ExplainFileSectionPromptInput = {
  /** Complete source code for the file being analyzed. */
  sourceCode: string;

  /** Workspace-relative or absolute path used only as prompt context. */
  filePath: string;

  /** VS Code TextDocument.languageId value, when available. */
  programmingLanguage?: string;

  /** Instruction resolved from the user's VS Code AI response language setting. */
  responseLanguageInstruction: string;

  /** Whether dependency directives should be omitted from the numbered source block. */
  skipDependencyDirectives?: boolean;
};

/**
 * Creates a prompt that asks the AI to return file analysis and section analysis together.
 *
 * @param input - Source file context and response-language instruction.
 * @returns Prompt text for a combined file and section AI request.
 *
 * @example
 * const prompt = explainFileSectionPrompt({
 *   sourceCode: "export function Button() { return <button>Save</button>; }",
 *   filePath: "src/Button.tsx",
 *   programmingLanguage: "typescriptreact",
 *   responseLanguageInstruction: "Respond in English.",
 * });
 */
export function explainFileSectionPrompt(input: ExplainFileSectionPromptInput): string {
  return `
You are explaining one source file for CZaza, an IDE code understanding tool.

${input.responseLanguageInstruction}

Return only a stable JSON object matching the combined file and section analysis DTO.
Do not return line analysis, token analysis, markdown, or extra text.

Context:
- filePath: ${input.filePath}
- VS Code language id: ${input.programmingLanguage ?? "unknown"}

Required JSON shape:
{
  "file": {
    "summary": "",
    "detail": "",
    "aiNotes": []
  },
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

File rules:
- file.summary must be concise and explain the file's primary responsibility.
- file.detail must explain the file's purpose, important behavior, and relevant context.

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
${formatSourceCodeForStructuredAnalysisPrompt(input)}
\`\`\`
`;
}
