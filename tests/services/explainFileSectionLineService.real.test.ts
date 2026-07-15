/**
 * Real AI integration test for coordinated file, section, and line analysis.
 */

import { describe, expect, it } from "vitest";
import { AI_REQUEST_DEFAULTS } from "@shared/config/aiRequestDefaults";
import { createDeepSeekClient } from "@shared/providers/deepseek";
import { explainFileSectionLinePrompt } from "@shared/prompts/explainFileSectionLinePrompt";
import { assessAllNotesRequest } from "@shared/services/allNotesRequestLimitService";
import { explainFileSectionLineService } from "@shared/services/explainFileSectionLineService";
import { selectLineAnalysisCandidates } from "@shared/services/lineAnalysisCandidateService";
import { AI_CATALOG } from "@vscode/config/aiCatalog";
import { loadEnvFile } from "./realAiTestUtils";

const shouldRunRealAiTest = process.env.RUN_REAL_AI_TEST === "true";
const deepSeekModel = "deepseek-v4-flash";
const filePath = "synthetic/saveTask.ts";
const programmingLanguage = "typescript";
const sourceCode = [
  'import { save } from "./save";',
  "",
  "export function run(value: string) {",
  "  if (!value.trim()) {",
  '    throw new Error("Value is required.");',
  "  }",
  "",
  "  return save(value);",
  "}",
].join("\n");

if (shouldRunRealAiTest) {
  loadEnvFile(".env.local");
}

describe.skipIf(!shouldRunRealAiTest)(
  "explainFileSectionLineService() real AI integration",
  () => {
    it("filters, assesses, requests, and normalizes all three analysis levels", async () => {
      const apiKey = process.env.DEEPSEEK_API_KEY ?? process.env.VITE_DEEPSEEK_API_KEY;

      expect(apiKey?.trim().length).toBeGreaterThan(0);

      const sourceLineCount = sourceCode.split(/\r?\n/).length;
      const candidates = selectLineAnalysisCandidates({
        sourceText: sourceCode,
        programmingLanguage,
        skipDependencyDirectives:
          AI_REQUEST_DEFAULTS.lineAnalysis.skipDependencyDirectives.enabled,
      });
      const requestedLineNumbers = candidates.map((candidate) => candidate.lineNumber);
      const prompt = explainFileSectionLinePrompt({
        sourceCode,
        filePath,
        programmingLanguage,
        responseLanguageInstruction: "Respond in Simplified Chinese.",
        lineNumbers: requestedLineNumbers,
        skipDependencyDirectives:
          AI_REQUEST_DEFAULTS.lineAnalysis.skipDependencyDirectives.enabled,
      });
      const modelDefinition = AI_CATALOG.deepseek.models.find(
        (model) => model.id === deepSeekModel,
      );

      expect(modelDefinition).toBeDefined();

      const assessment = assessAllNotesRequest({
        prompt,
        sourceLineCount,
        candidateLineCount: requestedLineNumbers.length,
        modelContextWindowTokens: modelDefinition!.contextWindowTokens,
        modelMaxOutputTokens: modelDefinition!.maxOutputTokens,
      });

      expect(assessment.allowed).toBe(true);

      const aiClient = createDeepSeekClient({
        apiKey,
        model: deepSeekModel,
        maxTokens: assessment.recommendedMaxTokens,
        timeoutMs: 180_000,
      });
      const result = await explainFileSectionLineService(prompt, aiClient, {
        lineCount: sourceLineCount,
        requestedLineNumbers,
      });

      console.log(
        JSON.stringify(
          {
            model: deepSeekModel,
            filePath,
            sourceLineCount,
            candidateLineCount: requestedLineNumbers.length,
            estimatedInputTokens: assessment.estimatedInputTokens,
            estimatedOutputTokens: assessment.estimatedOutputTokens,
            recommendedMaxTokens: assessment.recommendedMaxTokens,
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
          (section) =>
            section.range.startLine >= 1 &&
            section.range.endLine >= section.range.startLine &&
            section.range.endLine <= sourceLineCount,
        ),
      ).toBe(true);
      expect(result.lines.map((line) => line.lineNumber)).toEqual(requestedLineNumbers);
      expect(result.lines.every((line) => line.summary.trim().length > 0)).toBe(true);
      expect(result.lines.every((line) => line.detail.trim().length > 0)).toBe(true);
    }, 210_000);
  },
);
