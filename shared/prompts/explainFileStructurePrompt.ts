import type { Language } from "@shared/types/common";
import type { BasicStructureUnit } from "@shared/types/structureUnit";
import { COMMON_EXPLANATION_RULES, COMMON_RESPONSE_RULES } from "./commonPrompt";

export type ExplainFileStructureMode = "file-structure";

export type ExplainFileStructurePromptInput = {
  code: string;
  language: Language;
  mode: ExplainFileStructureMode;
  filePath?: string;
  structureUnits?: BasicStructureUnit[];
  userNote?: string;
};

export function explainFileStructurePrompt(input: ExplainFileStructurePromptInput): string {
  const structureUnits = input.structureUnits ?? [];

  return `
You are explaining one source file for CZaza, an IDE code understanding tool.

Return a stable JSON object for mode "${input.mode}".

Layers in this request:
1. file: whole-file explanation.
2. structureUnits: explanations for parser-detected structure units.

Semantic units, line units, and token units are out of scope for this request. Do not return semanticUnits, lines, or tokenUnits.

Context:
- language: ${input.language}
- mode: ${input.mode}
- filePath: ${input.filePath ?? ""}

Parser-detected structure units:
\`\`\`json
${JSON.stringify(toStructurePromptUnits(structureUnits), null, 2)}
\`\`\`

Rules:
${COMMON_RESPONSE_RULES}
- Do not invent code snippets or structure unit ids.

structureUnits rules:
- Return one structureUnits item for each parser-detected structure unit id.
- Return only id and explanation for each structureUnits item.
- Do not return kind, name, range, or code for structureUnits. CZaza already has them locally.
- Explain each structure as a whole unit. Do not explain every line inside it.

explanation rules:
${COMMON_EXPLANATION_RULES}

Required JSON shape:
{
  "language": "${input.language}",
  "file": {
    "explanation": {
      "summary": "",
      "detail": "",
      "aiNotes": []
    }
  },
  "structureUnits": [
    {
      "id": "",
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

function toStructurePromptUnits(structureUnits: BasicStructureUnit[]) {
  return structureUnits.map((unit) => ({
    id: unit.id,
    kind: unit.kind,
    name: unit.name,
    range: unit.range,
  }));
}
