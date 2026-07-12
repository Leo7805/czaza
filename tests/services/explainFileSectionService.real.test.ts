/**
 * Real AI integration test for combined file and section analysis.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDeepSeekClient } from "@shared/providers/deepseek";
import { explainFileSectionPrompt } from "@shared/prompts/explainFileSectionPrompt";
import { explainFileSectionService } from "@shared/services/explainFileSectionService";
import { loadEnvFile } from "./realAiTestUtils";

const shouldRunRealAiTest = process.env.RUN_REAL_AI_TEST === "true";
const deepSeekModel = "deepseek-v4-flash";
const filePath = "shared/services/explainFileSectionService.ts";

if (shouldRunRealAiTest) {
  loadEnvFile(".env.local");
}

describe.skipIf(!shouldRunRealAiTest)("explainFileSectionService() real AI integration", () => {
  it("calls DeepSeek and normalizes combined file and section analysis", async () => {
    const apiKey = process.env.DEEPSEEK_API_KEY ?? process.env.VITE_DEEPSEEK_API_KEY;

    expect(apiKey?.trim().length).toBeGreaterThan(0);

    const sourceCode = readFileSync(filePath, "utf-8");
    const prompt = explainFileSectionPrompt({
      sourceCode,
      filePath,
      programmingLanguage: "typescript",
      responseLanguageInstruction: "Respond in Simplified Chinese.",
    });
    const aiClient = createDeepSeekClient({
      apiKey,
      model: deepSeekModel,
    });

    const result = await explainFileSectionService(prompt, aiClient, {
      lineCount: sourceCode.split(/\r?\n/).length,
    });

    console.log(
      JSON.stringify(
        {
          model: deepSeekModel,
          filePath,
          analysis: result,
        },
        null,
        2,
      ),
    );

    expect(result.file.summary.trim().length).toBeGreaterThan(0);
    expect(result.file.detail.trim().length).toBeGreaterThan(0);
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.sections.every((section) => section.title.trim().length > 0)).toBe(true);
    expect(result.sections.every((section) => section.summary.trim().length > 0)).toBe(true);
    expect(result.sections.every((section) => section.detail.trim().length > 0)).toBe(true);
    expect(
      result.sections.every(
        (section) => section.range.startLine >= 1 && section.range.endLine >= section.range.startLine,
      ),
    ).toBe(true);
  }, 90_000);
});
