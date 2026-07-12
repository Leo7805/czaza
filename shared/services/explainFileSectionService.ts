import type { AiClient } from "@shared/ai/aiClient";
import type { FileAnalysis } from "@shared/models/ai/file";
import type { SectionAnalysis } from "@shared/models/ai/section";
import { parseStructureUnits } from "@shared/parser/structureUnitParser";
import { explainFileSectionPrompt } from "@shared/prompts/explainFileSectionPrompt";
import type { Language } from "@shared/types/common";
import {
  asRecord,
  inferLanguage,
  nonEmptyString,
  normalizeRange,
  normalizeStringArray,
  parseAiJson,
} from "./explainUtils";

export type ExplainFileSectionServiceInput = {
  sourceCode: string;
  filePath: string;
  language?: Language;
  userNote?: string;
};

export type FileSectionAnalysis = {
  language: Language;
  file: FileAnalysis;
  sections: SectionAnalysis[];
  userNote?: string;
};

type NormalizeContext = {
  language: Language;
  lineCount: number;
  userNote?: string;
};

/**
 * Calls AI for the new first analysis stage: file and meaningful sections.
 */
export async function explainFileSectionService(
  input: ExplainFileSectionServiceInput,
  aiClient: AiClient,
): Promise<FileSectionAnalysis> {
  const language = input.language ?? inferLanguage(input.filePath);
  const structureUnits = parseStructureUnits({
    sourceCode: input.sourceCode,
    language,
    filePath: input.filePath,
  });
  const prompt = explainFileSectionPrompt({
    code: input.sourceCode,
    language,
    filePath: input.filePath,
    structureUnits,
    userNote: input.userNote,
  });

  const result = await aiClient.complete(prompt);
  const parsedResult = parseAiJson(result);

  return normalizeFileSectionAnalysis(parsedResult, {
    language,
    lineCount: input.sourceCode.split(/\r?\n/).length,
    userNote: input.userNote,
  });
}

function normalizeFileSectionAnalysis(value: unknown, context: NormalizeContext): FileSectionAnalysis {
  const record = asRecord(value);
  const analysis: FileSectionAnalysis = {
    language: normalizeLanguage(record.language, context.language),
    file: normalizeFileAnalysis(record.file),
    sections: normalizeSectionAnalyses(record.sections, context.lineCount),
  };

  const userNote = nonEmptyString(record.userNote) ?? context.userNote;
  if (userNote) {
    analysis.userNote = userNote;
  }

  return analysis;
}

function normalizeFileAnalysis(value: unknown): FileAnalysis {
  const record = asRecord(value);

  return {
    summary: typeof record.summary === "string" ? record.summary : "",
    detail: typeof record.detail === "string" ? record.detail : "",
    aiNotes: normalizeStringArray(record.aiNotes),
  };
}

function normalizeSectionAnalyses(value: unknown, lineCount: number): SectionAnalysis[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const sections: SectionAnalysis[] = [];

  for (const item of value) {
    const record = asRecord(item);
    const range = normalizeRange(record.range, lineCount);
    const title = nonEmptyString(record.title);

    if (!range || !title) {
      continue;
    }

    const section: SectionAnalysis = {
      title,
      range,
      summary: typeof record.summary === "string" ? record.summary : "",
      detail: typeof record.detail === "string" ? record.detail : "",
      aiNotes: normalizeStringArray(record.aiNotes),
    };

    const kind = nonEmptyString(record.kind);
    if (kind) {
      section.kind = kind;
    }

    sections.push(section);
  }

  return sections.sort((left, right) => left.range.startLine - right.range.startLine);
}

function normalizeLanguage(value: unknown, fallback: Language): Language {
  return value === "ts" || value === "tsx" || value === "js" || value === "jsx" || value === "csharp"
    ? value
    : fallback;
}
