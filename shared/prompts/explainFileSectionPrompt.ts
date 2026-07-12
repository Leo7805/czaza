import type { SectionDefinition } from "@shared/models/common";
import type { Language } from "@shared/types/common";
import type { BasicStructureUnit } from "@shared/types/structureUnit";
import { COMMON_RESPONSE_RULES } from "./commonPrompt";

export type ExplainFileSectionPromptInput = {
  code: string;
  language: Language;
  filePath?: string;
  structureUnits?: BasicStructureUnit[];
  userNote?: string;
};

/**
 * Builds the first-stage prompt for the new file/section analysis model.
 */
export function explainFileSectionPrompt(input: ExplainFileSectionPromptInput): string {
  const structureUnits = input.structureUnits ?? [];

  return `
You are explaining one source file for CZaza, an IDE code understanding tool.

Return a stable JSON object for file and section analysis.

Layers in this request:
1. file: whole-file analysis.
2. sections: meaningful code sections.

Line analysis is out of scope for this request. Do not return lines or tokenUnits.

Context:
- language: ${input.language}
- filePath: ${input.filePath ?? ""}
- userNote: ${input.userNote ?? ""}

Parser-detected structure units for reference:
\`\`\`json
${JSON.stringify(toStructurePromptUnits(structureUnits), null, 2)}
\`\`\`

Rules:
${COMMON_RESPONSE_RULES}
- Use 1-based inclusive line numbers for section ranges.
- Do not invent line numbers outside the source file.
- Do not return source code. CZaza already has it locally.
- File and section analysis fields are direct AI DTO fields: summary, detail, and aiNotes.
- summary must be concise.
- detail must explain purpose, behavior, and important context without being exhaustive.
- aiNotes should contain useful extra context only when needed. Use [] when there are none.

sections rules:
- Create sections for meaningful code regions that help a reader understand the file.
- Sections may align with parser-detected structures or represent logical regions that cross syntax nodes.
- Do not create sections for single ordinary lines.
- Each section must include title, range, summary, detail, and aiNotes.
- kind is optional and should be a short category when useful.

Required JSON shape:
{
  "language": "${input.language}",
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

Source code:
\`\`\`${input.language}
${input.code}
\`\`\`
`;
}

function toStructurePromptUnits(structureUnits: BasicStructureUnit[]): SectionDefinition[] {
  return structureUnits.map((unit) => ({
    title: unit.name,
    kind: unit.kind,
    range: unit.range,
  }));
}
