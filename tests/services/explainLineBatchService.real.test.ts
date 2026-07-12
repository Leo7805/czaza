/**
 * Real AI integration test for batch line analysis.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDeepSeekClient } from "@shared/providers/deepseek";
import {
  explainLineBatchPrompt,
  type ExplainLineBatchPromptLine,
} from "@shared/prompts/explainLineBatchPrompt";
import { explainLineBatchService } from "@shared/services/explainLineBatchService";
import { loadEnvFile } from "./realAiTestUtils";

const shouldRunRealAiTest = process.env.RUN_REAL_AI_TEST === "true";
const deepSeekModel = "deepseek-v4-flash";
const filePath = "shared/services/explainLineBatchService.ts";

if (shouldRunRealAiTest) {
  loadEnvFile(".env.local");
}

describe.skipIf(!shouldRunRealAiTest)("explainLineBatchService() real AI integration", () => {
  it("calls DeepSeek and normalizes batch line analysis DTOs", async () => {
    const apiKey = process.env.DEEPSEEK_API_KEY ?? process.env.VITE_DEEPSEEK_API_KEY;

    expect(apiKey?.trim().length).toBeGreaterThan(0);

    const sourceCode = readFileSync(filePath, "utf-8");
    const sourceLines = selectMeaningfulSourceLines(sourceCode, 6);
    const requestedLineNumbers = sourceLines.map((line) => line.lineNumber);
    const prompt = explainLineBatchPrompt({
      sourceLines,
      filePath,
      programmingLanguage: "typescript",
      responseLanguageInstruction: "Respond in Simplified Chinese.",
    });
    const aiClient = createDeepSeekClient({
      apiKey,
      model: deepSeekModel,
    });

    const result = await explainLineBatchService(prompt, aiClient, {
      requestedLineNumbers,
    });

    console.log(
      JSON.stringify(
        {
          model: deepSeekModel,
          filePath,
          lines: result,
        },
        null,
        2,
      ),
    );

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((line) => requestedLineNumbers.includes(line.lineNumber))).toBe(true);
    expect(result.every((line) => line.summary.trim().length > 0)).toBe(true);
    expect(result.every((line) => line.detail.trim().length > 0)).toBe(true);

    if (result.some((line) => line.aiNotes)) {
      expect(
        result.every((line) => !line.aiNotes || line.aiNotes.every((note) => note.trim().length > 0)),
      ).toBe(true);
    }
  }, 90_000);
});

/**
 * Selects meaningful source lines for a compact real AI batch test.
 *
 * @param sourceCode - Complete source code to sample from.
 * @param maxLines - Maximum number of source lines to include.
 * @returns Non-empty, non-comment source lines with one-based line numbers.
 *
 * @example
 * const lines = selectMeaningfulSourceLines("const value = 1;", 1);
 */
function selectMeaningfulSourceLines(
  sourceCode: string,
  maxLines: number,
): ExplainLineBatchPromptLine[] {
  return sourceCode
    .split(/\r?\n/)
    .map((text, index) => ({
      lineNumber: index + 1,
      text,
    }))
    .filter((line) => isMeaningfulSourceLine(line.text))
    .slice(0, maxLines);
}

/**
 * Checks whether a source line is useful enough for line explanation testing.
 *
 * @param text - Source text for one line.
 * @returns True when the line is not empty or comment-only.
 *
 * @example
 * const ok = isMeaningfulSourceLine("const value = 1;");
 */
function isMeaningfulSourceLine(text: string): boolean {
  const trimmed = text.trim();

  return (
    trimmed.length > 0 &&
    !trimmed.startsWith("//") &&
    !trimmed.startsWith("/*") &&
    !trimmed.startsWith("*") &&
    !trimmed.startsWith("*/")
  );
}
