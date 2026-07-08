import type { CodeExplanation } from "@shared/types/codeExplanation";
import type { Language } from "@shared/types/common";
import { COMMON_EXPLANATION_RULES, COMMON_RESPONSE_RULES } from "./commonPrompt";

export type ExplainSemanticPromptInput = {
  code: string;
  language: Language;
  filePath?: string;
  context: CodeExplanation;
};

export function explainSemanticPrompt(input: ExplainSemanticPromptInput): string {
  return `
You are identifying semantic units for one source file in CZaza, an IDE code understanding tool.

Return only semanticUnits. Do not return file, structureUnits, lines, or tokenUnits.

Context:
- language: ${input.language}
- filePath: ${input.filePath ?? ""}
- fileSummary: ${input.context.file.explanation.summary}

Parser-detected structure summaries:
\`\`\`json
${JSON.stringify(toStructureContext(input.context), null, 2)}
\`\`\`

Rules:
${COMMON_RESPONSE_RULES}
- Use 1-based inclusive line numbers.
- Do not invent line numbers.
- Do not create semanticUnits that duplicate parser-detected structureUnits.
- Do not create semanticUnits for single ordinary lines.
- A semanticUnit should explain logical intent or flow that is not already represented by a structure summary.
- Good semantic units include setup flows, validation sections, grouped transformations, side-effect flows, rendering regions, dependency wiring, and cross-structure logic.
- Return only id, title, range, and explanation for semanticUnits.

explanation rules:
${COMMON_EXPLANATION_RULES}

Required JSON shape:
{
  "semanticUnits": [
    {
      "id": "semantic:title:startLine",
      "title": "",
      "range": {
        "startLine": 1,
        "endLine": 1
      },
      "explanation": {
        "summary": "",
        "detail": "",
        "aiNotes": []
      }
    }
  ]
}

Source code:
\`\`\`${input.language}
${input.code}
\`\`\`
`;
}

function toStructureContext(context: CodeExplanation) {
  return context.structureUnits.map((unit) => ({
    id: unit.id,
    kind: unit.kind,
    name: unit.name,
    range: unit.range,
    summary: unit.explanation.summary,
  }));
}
