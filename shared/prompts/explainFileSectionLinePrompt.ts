/**
 * Builds prompts for coordinated file, section, and line AI analysis.
 */

import {
  COMMON_AI_NOTES_RULES,
  COMMON_ANALYSIS_STYLE_RULES,
  COMMON_CODE_REFERENCE_RULES,
  COMMON_JSON_OUTPUT_RULES,
} from "./commonPrompt";

/**
 * Input required to build a coordinated file, section, and line analysis prompt.
 */
export type ExplainFileSectionLinePromptInput = {
  /** Complete source code used as shared context for all three analysis levels. */
  sourceCode: string;

  /** Workspace-relative or absolute path used only as prompt context. */
  filePath: string;

  /** VS Code TextDocument.languageId value, when available. */
  programmingLanguage?: string;

  /** Instruction resolved from the user's VS Code AI response language setting. */
  responseLanguageInstruction: string;

  /** Filtered one-based source line numbers that must receive line analysis. */
  lineNumbers: readonly number[];
};

/**
 * Creates one prompt for coordinated file, section, and line AI analysis.
 *
 * The caller filters line candidates locally before constructing the prompt.
 * Complete numbered source remains available so every analysis level uses the
 * same file context, while line output is restricted to the supplied numbers.
 *
 * @param input - Source context, response language, and filtered target line numbers.
 * @returns Prompt text for a file, section, and line AI request.
 *
 * @example
 * const prompt = explainFileSectionLinePrompt({
 *   sourceCode: "export function add(a: number, b: number) {\n  return a + b;\n}",
 *   filePath: "src/add.ts",
 *   programmingLanguage: "typescript",
 *   responseLanguageInstruction: "Respond in English.",
 *   lineNumbers: [1, 2],
 * });
 */
export function explainFileSectionLinePrompt(
  input: ExplainFileSectionLinePromptInput,
): string {
  return `
You are explaining one source file for CZaza, an IDE code understanding tool.

Analyze the file, its meaningful sections, and the selected source lines together so all three levels use the same context.

${input.responseLanguageInstruction}

Return only a stable JSON object matching the combined file, section, and line analysis DTO.
Do not return token analysis, markdown, or extra text.

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
  ],
  "lines": ${formatLineResponseShape(input.lineNumbers)}
}

Coordination rules:
- Analyze all three levels from the same source context.
- Keep file, section, and line explanations complementary rather than repeating identical text.
- File analysis must summarize the whole file instead of individual lines.
- Section analysis must explain meaningful regions instead of duplicating the file summary.
- Line analysis must explain immediate behavior using the whole file and enclosing section as context.

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

Line rules:
- The application has already filtered the line-analysis targets locally.
- Target line numbers: ${JSON.stringify(input.lineNumbers)}
- Return exactly one lines item for every target line number.
- Do not omit, duplicate, or add line numbers.
- Preserve each target lineNumber exactly as a 1-based source line number.
- Return "lines": [] when the target line-number list is empty.
- Do not return source code in line items.
- summary must concisely explain the line's immediate responsibility.
- detail must explain the line's behavior in its file and section context.

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

/** Formats the line array example without inventing a target line number. */
function formatLineResponseShape(lineNumbers: readonly number[]): string {
  const exampleLineNumber = lineNumbers[0];

  if (exampleLineNumber === undefined) {
    return "[]";
  }

  return `[\n    {\n      "lineNumber": ${exampleLineNumber},\n      "summary": "",\n      "detail": "",\n      "aiNotes": []\n    }\n  ]`;
}

/** Formats complete source code with stable one-based line-number prefixes. */
function formatSourceCodeWithLineNumbers(sourceCode: string): string {
  return sourceCode
    .split(/\r?\n/)
    .map((line, index) => `${index + 1}: ${line}`)
    .join("\n");
}
