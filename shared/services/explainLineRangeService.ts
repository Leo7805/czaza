import type { AiClient } from "@shared/ai/aiClient";
import { explainLineRangePrompt } from "@shared/prompts/explainLineRangePrompt";
import type { CodeExplanation } from "@shared/types/codeExplanation";
import type { Language, Range } from "@shared/types/common";
import type { LineUnit } from "@shared/types/lineUnit";
import type { TokenUnit } from "@shared/types/tokenUnit";
import {
  asRecord,
  inferLanguage,
  nonEmptyString,
  normalizeExplanationBlock,
  normalizeLineNumber,
  parseAiJson,
  slugify,
} from "./explainUtils";

export type ExplainLineRangeServiceInput = {
  sourceCode: string;
  filePath: string;
  range: Range;
  context: CodeExplanation;
  language?: Language;
};

export async function explainLineRangeService(
  input: ExplainLineRangeServiceInput,
  aiClient: AiClient,
): Promise<LineUnit[]> {
  const sourceLines = input.sourceCode.split(/\r?\n/);
  const normalizedRange = normalizeRequestedRange(input.range, sourceLines.length);

  if (!normalizedRange) {
    return [];
  }

  const language = input.language ?? input.context.language ?? inferLanguage(input.filePath);
  const prompt = explainLineRangePrompt({
    language,
    filePath: input.filePath,
    range: normalizedRange,
    sourceLines,
    context: input.context,
  });

  const result = await aiClient.complete(prompt);
  const parsedResult = parseAiJson(result);
  const record = asRecord(parsedResult);

  return normalizeLineUnits(record.lines, sourceLines, normalizedRange);
}

function normalizeLineUnits(value: unknown, sourceLines: string[], requestedRange: Range): LineUnit[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const lineUnits: LineUnit[] = [];

  for (const item of value) {
    const record = asRecord(item);
    const lineNumber = normalizeLineNumber(record.lineNumber, sourceLines.length);

    if (!lineNumber || lineNumber < requestedRange.startLine || lineNumber > requestedRange.endLine) {
      continue;
    }

    const sourceLine = sourceLines[lineNumber - 1] ?? "";

    if (isSkippableLine(sourceLine)) {
      continue;
    }

    const tokenUnits = normalizeTokenUnits(record.tokenUnits, lineNumber);
    const lineUnit: LineUnit = {
      lineNumber,
      code: sourceLine,
      explanation: normalizeExplanationBlock(record.explanation),
    };

    if (tokenUnits.length > 0) {
      lineUnit.tokenUnits = tokenUnits;
    }

    lineUnits.push(lineUnit);
  }

  return lineUnits.sort((a, b) => a.lineNumber - b.lineNumber);
}

function normalizeTokenUnits(value: unknown, lineNumber: number): TokenUnit[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const tokenUnits: TokenUnit[] = [];

  for (const item of value) {
    const record = asRecord(item);
    const text = nonEmptyString(record.text);

    if (!text) {
      continue;
    }

    const kind = normalizeTokenKind(record.kind);
    const tokenUnit: TokenUnit = {
      id: nonEmptyString(record.id) ?? `token:${slugify(text)}:${lineNumber}`,
      text,
      range: {
        startLine: lineNumber,
        endLine: lineNumber,
      },
      explanation: normalizeExplanationBlock(record.explanation),
    };

    if (kind) {
      tokenUnit.kind = kind;
    }

    tokenUnits.push(tokenUnit);
  }

  return tokenUnits;
}

function normalizeRequestedRange(value: Range, lineCount: number): Range | undefined {
  const startLine = normalizeLineNumber(value.startLine, lineCount);
  const endLine = normalizeLineNumber(value.endLine, lineCount);

  if (!startLine || !endLine) {
    return undefined;
  }

  return {
    startLine: Math.min(startLine, endLine),
    endLine: Math.max(startLine, endLine),
  };
}

function normalizeTokenKind(value: unknown): TokenUnit["kind"] {
  return value === "tailwind-class" ||
    value === "css-class" ||
    value === "jsx-prop" ||
    value === "jsx-tag" ||
    value === "operator" ||
    value === "keyword" ||
    value === "identifier" ||
    value === "literal" ||
    value === "other"
    ? value
    : undefined;
}

function isSkippableLine(line: string): boolean {
  const trimmed = line.trim();

  return (
    trimmed.length === 0 ||
    trimmed === "{" ||
    trimmed === "}" ||
    trimmed === ");" ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("*/")
  );
}
