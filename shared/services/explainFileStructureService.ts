import type { AiClient } from "@shared/ai/aiClient";
import {
  explainFileStructurePrompt,
  type ExplainFileStructureMode,
} from "@shared/prompts/explainFileStructurePrompt";
import { parseStructureUnits } from "@shared/parser/structureUnitParser";
import type { Language } from "@shared/types/common";
import type { CodeExplanation } from "@shared/types/codeExplanation";
import type { FileUnit } from "@shared/types/fileUnit";
import type { BasicStructureUnit, StructureUnit } from "@shared/types/structureUnit";
import {
  asRecord,
  inferLanguage,
  normalizeExplanationBlock,
  parseAiJson,
} from "./explainUtils";

export type ExplainFileStructureServiceInput = {
  sourceCode: string;
  filePath: string;
  language?: Language;
  mode?: ExplainFileStructureMode;
  userNote?: string;
};

type NormalizeContext = {
  language: Language;
  structureUnits: BasicStructureUnit[];
  userNote?: string;
};

/**
 * Calls AI for the first explanation stage: file and parser-detected structures.
 */
export async function explainFileStructureService(
  input: ExplainFileStructureServiceInput,
  aiClient: AiClient,
): Promise<CodeExplanation> {
  const language = input.language ?? inferLanguage(input.filePath);
  const mode = input.mode ?? "file-structure";
  const structureUnits = parseStructureUnits({
    sourceCode: input.sourceCode,
    language,
    filePath: input.filePath,
  });
  const prompt = explainFileStructurePrompt({
    code: input.sourceCode,
    language,
    mode,
    filePath: input.filePath,
    structureUnits,
    userNote: input.userNote,
  });

  const result = await aiClient.complete(prompt);
  const parsedResult = parseAiJson(result);

  return normalizeCodeExplanation(parsedResult, {
    language,
    structureUnits,
    userNote: input.userNote,
  });
}

function normalizeCodeExplanation(value: unknown, context: NormalizeContext): CodeExplanation {
  const record = asRecord(value);

  return {
    language: normalizeLanguage(record.language, context.language),
    file: normalizeFileUnit(record.file, context.userNote),
    structureUnits: normalizeStructureUnits(record.structureUnits, context.structureUnits),
    semanticUnits: [],
    lines: undefined,
    userNote: typeof record.userNote === "string" ? record.userNote : context.userNote,
  };
}

function normalizeFileUnit(value: unknown, userNote: string | undefined): FileUnit {
  const record = asRecord(value);
  const explanation = normalizeExplanationBlock(record.explanation);

  return {
    explanation: {
      ...explanation,
      userNotes: normalizeLocalUserNotes(userNote),
    },
  };
}

function normalizeStructureUnits(value: unknown, structureUnits: BasicStructureUnit[]): StructureUnit[] {
  const aiUnits = Array.isArray(value) ? value.map(asRecord) : [];
  const aiUnitById = new Map(aiUnits.map((unit) => [String(unit.id ?? ""), unit]));

  return structureUnits.map((unit) => {
    const aiUnit = aiUnitById.get(unit.id);

    return {
      ...unit,
      explanation: normalizeExplanationBlock(aiUnit?.explanation),
    };
  });
}

function normalizeLocalUserNotes(value: string | undefined): string[] {
  return value && value.trim().length > 0 ? [value] : [];
}

function normalizeLanguage(value: unknown, fallback: Language): Language {
  return value === "ts" || value === "tsx" || value === "js" || value === "jsx" || value === "csharp"
    ? value
    : fallback;
}
