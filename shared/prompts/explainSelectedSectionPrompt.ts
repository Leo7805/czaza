/**
 * Builds a prompt for regenerating one existing section note.
 */

import {
  COMMON_AI_NOTES_RULES,
  COMMON_ANALYSIS_STYLE_RULES,
  COMMON_CODE_REFERENCE_RULES,
  COMMON_JSON_OUTPUT_RULES,
} from "./commonPrompt";
import { formatSourceCodeForStructuredAnalysisPrompt } from "./sourcePromptFormatter";

/** Input required to explain one selected section with full-file context. */
export type ExplainSelectedSectionPromptInput = {
  /** Complete source code for the current file. */
  sourceCode: string;
  /** Workspace-relative or absolute path used as prompt context. */
  filePath: string;
  /** VS Code language identifier, when available. */
  programmingLanguage?: string;
  /** User-selected response-language instruction. */
  responseLanguageInstruction: string;
  /** Existing section title. */
  sectionTitle: string;
  /** Existing section kind, when available. */
  sectionKind?: string;
  /** Existing one-based inclusive section start line. */
  sectionStartLine: number;
  /** Existing one-based inclusive section end line. */
  sectionEndLine: number;
  /** Whether configured dependency directives should be omitted. */
  skipDependencyDirectives?: boolean;
};

/**
 * Creates a prompt that regenerates only one existing section explanation.
 *
 * The complete file is provided for context, while the section identity and
 * range remain controlled by the existing Store note.
 *
 * @param input - File context and selected section metadata.
 * @returns Prompt text for one-section AI analysis.
 *
 * @example
 * const prompt = explainSelectedSectionPrompt({
 *   sourceCode: "function run() { return true; }",
 *   filePath: "src/run.ts",
 *   responseLanguageInstruction: "Respond in Simplified Chinese.",
 *   sectionTitle: "Run function",
 *   sectionStartLine: 1,
 *   sectionEndLine: 1,
 * });
 */
export function explainSelectedSectionPrompt(
  input: ExplainSelectedSectionPromptInput,
): string {
  return `
You are regenerating the AI explanation for one existing source section in CZaza.

${input.responseLanguageInstruction}

Return only a stable JSON object matching the section analysis DTO list.
Return exactly one item in the sections array.
Do not return file analysis, line analysis, token analysis, markdown, or extra text.

Context:
- filePath: ${input.filePath}
- VS Code language id: ${input.programmingLanguage ?? "unknown"}
- selected section title: ${input.sectionTitle}
- selected section kind: ${input.sectionKind ?? ""}
- selected section range: ${input.sectionStartLine}-${input.sectionEndLine}

Required JSON shape:
{
  "sections": [
    {
      "title": "${input.sectionTitle}",
      "kind": "${input.sectionKind ?? ""}",
      "range": {
        "startLine": ${input.sectionStartLine},
        "endLine": ${input.sectionEndLine}
      },
      "summary": "",
      "detail": "",
      "aiNotes": []
    }
  ]
}

Section rules:
- Explain only the selected existing section.
- Keep the selected section title, kind, and range unchanged in the response.
- Use the rest of the file only to understand the selected section's context.
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
