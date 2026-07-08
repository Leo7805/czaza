import type { AiClient } from "@shared/ai/aiClient";
import { explainSemanticPrompt } from "@shared/prompts/explainSemanticPrompt";
import type { CodeExplanation } from "@shared/types/codeExplanation";
import type { Language } from "@shared/types/common";
import type { SemanticUnit } from "@shared/types/semanticUnit";
import {
  asRecord,
  inferLanguage,
  nonEmptyString,
  normalizeExplanationBlock,
  normalizeRange,
  parseAiJson,
  slugify,
} from "./explainUtils";

export type ExplainSemanticServiceInput = {
  sourceCode: string;
  filePath: string;
  context: CodeExplanation;
  language?: Language;
};

export async function explainSemanticService(
  input: ExplainSemanticServiceInput,
  aiClient: AiClient,
): Promise<SemanticUnit[]> {
  const language = input.language ?? input.context.language ?? inferLanguage(input.filePath);
  const prompt = explainSemanticPrompt({
    code: input.sourceCode,
    language,
    filePath: input.filePath,
    context: input.context,
  });

  const result = await aiClient.complete(prompt);
  const parsedResult = parseAiJson(result);
  const record = asRecord(parsedResult);

  return normalizeSemanticUnits(record.semanticUnits, input.sourceCode.split(/\r?\n/).length);
}

function normalizeSemanticUnits(value: unknown, lineCount: number): SemanticUnit[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = asRecord(item);
      const range = normalizeRange(record.range, lineCount);

      if (!range) {
        return null;
      }

      return {
        id: nonEmptyString(record.id) ?? `semantic:${slugify(nonEmptyString(record.title) ?? "unit")}:${range.startLine}`,
        title: nonEmptyString(record.title) ?? "Semantic unit",
        range,
        explanation: normalizeExplanationBlock(record.explanation),
      };
    })
    .filter((item): item is SemanticUnit => item !== null);
}
