import type { CodeExplanation } from "@shared/types/codeExplanation";
import type { Language, Range } from "@shared/types/common";
import { COMMON_EXPLANATION_RULES, COMMON_RESPONSE_RULES } from "./commonPrompt";

export type ExplainLineRangePromptInput = {
  language: Language;
  filePath?: string;
  range: Range;
  sourceLines: string[];
  context: CodeExplanation;
};

export function explainLineRangePrompt(input: ExplainLineRangePromptInput): string {
  return `
You are explaining a small source line range for CZaza, an IDE code understanding tool.

Return only line units for the requested range. Each line unit may include tokenUnits when useful.
Do not return file, structureUnits, or semanticUnits.

Context:
- language: ${input.language}
- filePath: ${input.filePath ?? ""}
- requestedRange: ${input.range.startLine}-${input.range.endLine}
- fileSummary: ${input.context.file.explanation.summary}

Relevant structure summaries:
\`\`\`json
${JSON.stringify(toStructureContext(input.context, input.range), null, 2)}
\`\`\`

Relevant semantic summaries:
\`\`\`json
${JSON.stringify(toSemanticContext(input.context, input.range), null, 2)}
\`\`\`

Rules:
${COMMON_RESPONSE_RULES}
- Use 1-based line numbers.
- Explain only lines inside requestedRange.
- Skip comment-only lines, empty lines, standalone braces, and syntax-only closing lines.
- Do not return code. CZaza reconstructs line code locally from lineNumber.
- Add tokenUnits only when they help explain syntax, Tailwind classes, CSS classes, JSX props, operators, identifiers, literals, method names, type annotations, or framework-specific fragments.
- Do not add tokenUnits for obvious punctuation, brackets, commas, or every trivial word.
- For className string values, create tokenUnits for useful class names in source order.
- Use kind "tailwind-class" for Tailwind classes, "css-class" for ordinary CSS classes, "jsx-prop" for JSX props, and "jsx-tag" for JSX tag names.

explanation rules:
${COMMON_EXPLANATION_RULES}

Required JSON shape:
{
  "lines": [
    {
      "lineNumber": 1,
      "explanation": {
        "summary": "",
        "detail": "",
        "aiNotes": []
      },
      "tokenUnits": [
        {
          "text": "hover:bg-slate-100",
          "kind": "tailwind-class",
          "explanation": {
            "summary": "",
            "detail": "",
            "aiNotes": []
          }
        }
      ]
    }
  ]
}

Requested source lines:
\`\`\`${input.language}
${formatSourceLines(input.sourceLines, input.range)}
\`\`\`
`;
}

function toStructureContext(context: CodeExplanation, range: Range) {
  return context.structureUnits
    .filter((unit) => overlaps(unit.range, range))
    .map((unit) => ({
      id: unit.id,
      kind: unit.kind,
      name: unit.name,
      range: unit.range,
      summary: unit.explanation.summary,
    }));
}

function toSemanticContext(context: CodeExplanation, range: Range) {
  return context.semanticUnits
    .filter((unit) => overlaps(unit.range, range))
    .map((unit) => ({
      id: unit.id,
      title: unit.title,
      range: unit.range,
      summary: unit.explanation.summary,
    }));
}

function formatSourceLines(sourceLines: string[], range: Range): string {
  return sourceLines
    .slice(range.startLine - 1, range.endLine)
    .map((line, index) => `${range.startLine + index}: ${line}`)
    .join("\n");
}

function overlaps(left: Range, right: Range): boolean {
  return left.startLine <= right.endLine && right.startLine <= left.endLine;
}
