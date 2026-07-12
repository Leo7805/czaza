/**
 * Real AI integration test for section-level analysis.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDeepSeekClient } from "@shared/providers/deepseek";
import { explainSectionPrompt } from "@shared/prompts/explainSectionPrompt";
import { explainSectionService } from "@shared/services/explainSectionService";
import { loadEnvFile } from "./realAiTestUtils";

const shouldRunRealAiTest = process.env.RUN_REAL_AI_TEST === "true";
const deepSeekModel = "deepseek-v4-flash";
const filePath = "shared/services/explainSectionService.ts";

if (shouldRunRealAiTest) {
  loadEnvFile(".env.local");
}

describe.skipIf(!shouldRunRealAiTest)("explainSectionService() real AI integration", () => {
  it("calls DeepSeek and normalizes section analysis DTOs", async () => {
    const apiKey = process.env.DEEPSEEK_API_KEY ?? process.env.VITE_DEEPSEEK_API_KEY;

    expect(apiKey?.trim().length).toBeGreaterThan(0);

    const sourceCode = readFileSync(filePath, "utf-8");
    const prompt = explainSectionPrompt({
      sourceCode,
      filePath,
      programmingLanguage: "typescript",
      responseLanguageInstruction: "Respond in Simplified Chinese.",
    });
    const aiClient = createDeepSeekClient({
      apiKey,
      model: deepSeekModel,
    });

    const result = await explainSectionService(prompt, aiClient, {
      lineCount: sourceCode.split(/\r?\n/).length,
    });

    console.log(
      JSON.stringify(
        {
          model: deepSeekModel,
          filePath,
          sourceCharacters: sourceCode.length,
          promptCharacters: prompt.length,
          sectionCount: result.length,
          sections: result,
        },
        null,
        2,
      ),
    );

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((section) => section.title.trim().length > 0)).toBe(true);
    expect(result.every((section) => section.summary.trim().length > 0)).toBe(true);
    expect(result.every((section) => section.detail.trim().length > 0)).toBe(true);
    expect(
      result.every(
        (section) => section.range.startLine >= 1 && section.range.endLine >= section.range.startLine,
      ),
    ).toBe(true);
  }, 90_000);
});
