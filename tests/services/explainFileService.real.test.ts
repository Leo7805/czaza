/**
 * Real AI integration test for file-level analysis.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDeepSeekClient } from "@shared/providers/deepseek";
import { explainFilePrompt } from "@shared/prompts/explainFilePrompt";
import { explainFileService } from "@shared/services/explainFileService";
import { loadEnvFile } from "./realAiTestUtils";

const shouldRunRealAiTest = process.env.RUN_REAL_AI_TEST === "true";
const deepSeekModel = "deepseek-v4-flash";
const filePath = "shared/services/explainFileService.ts";

if (shouldRunRealAiTest) {
  loadEnvFile(".env.local");
}

describe.skipIf(!shouldRunRealAiTest)("explainFileService() real AI integration", () => {
  it("calls DeepSeek and normalizes the file analysis DTO", async () => {
    const apiKey = process.env.DEEPSEEK_API_KEY ?? process.env.VITE_DEEPSEEK_API_KEY;

    expect(apiKey?.trim().length).toBeGreaterThan(0);

    const sourceCode = readFileSync(filePath, "utf-8");
    const prompt = explainFilePrompt({
      sourceCode,
      filePath,
      programmingLanguage: "typescript",
      responseLanguageInstruction: "Respond in Simplified Chinese.",
    });
    const aiClient = createDeepSeekClient({
      apiKey,
      model: deepSeekModel,
    });

    const result = await explainFileService(prompt, aiClient);

    console.log(
      JSON.stringify(
        {
          model: deepSeekModel,
          filePath,
          sourceCharacters: sourceCode.length,
          promptCharacters: prompt.length,
          fileAnalysis: result,
        },
        null,
        2,
      ),
    );

    expect(result.summary.trim().length).toBeGreaterThan(0);
    expect(result.detail.trim().length).toBeGreaterThan(0);
    expect(result).not.toHaveProperty("sections");
    expect(result).not.toHaveProperty("lines");

    if (result.aiNotes) {
      expect(result.aiNotes.every((note) => note.trim().length > 0)).toBe(true);
    }
  }, 90_000);
});
