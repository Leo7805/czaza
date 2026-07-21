/** Builds follow-up line-only prompts for batched All Notes generation. */

import {
  COMMON_AI_NOTES_RULES,
  COMMON_ANALYSIS_STYLE_RULES,
  COMMON_CODE_REFERENCE_RULES,
  COMMON_JSON_OUTPUT_RULES,
} from "./commonPrompt";
import { formatSourceCodeForStructuredAnalysisPrompt } from "./sourcePromptFormatter";

export type ExplainAllNotesLineBatchPromptInput = {
  sourceCode: string;
  filePath: string;
  programmingLanguage?: string;
  responseLanguageInstruction: string;
  lineNumbers: readonly number[];
  skipDependencyDirectives?: boolean;
};

/** Creates a line-only follow-up prompt while retaining the complete file as context. */
export function explainAllNotesLineBatchPrompt(
  input: ExplainAllNotesLineBatchPromptInput,
): string {
  return `
You are explaining selected source lines for CZaza, an IDE code understanding tool.

Use the complete file and its meaningful sections as context, but return line analysis only.

${input.responseLanguageInstruction}

Return only a stable JSON object matching this shape:
{
  "lines": [
    {
      "lineNumber": ${input.lineNumbers[0] ?? 1},
      "summary": "",
      "detail": "",
      "aiNotes": []
    }
  ]
}

Context:
- filePath: ${input.filePath}
- VS Code language id: ${input.programmingLanguage ?? "unknown"}

Line rules:
- Target line numbers: ${JSON.stringify(input.lineNumbers)}
- Return exactly one lines item for every target line number.
- Do not omit, duplicate, or add line numbers.
- Preserve each target lineNumber exactly as a 1-based source line number.
- Do not return file analysis, section analysis, source code, markdown, or extra text.
- summary must concisely explain the line's immediate responsibility.
- detail must explain the line's behavior using the whole file and enclosing section as context.

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
