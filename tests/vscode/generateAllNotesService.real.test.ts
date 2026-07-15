/**
 * Real AI integration test for coordinated All Notes generation.
 */

import { createDeepSeekClient } from "@shared/providers/deepseek";
import { createSourceHash } from "@shared/utils/hashUtils";
import { loadEnvFile } from "@tests/services/realAiTestUtils";
import { AI_CATALOG } from "@vscode/config/aiCatalog";
import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({}));

import { generateAllNotesService } from "@vscode/services/generateAllNotesService";

const shouldRunRealAiTest = process.env.RUN_REAL_AI_TEST === "true";
const deepSeekModel = "deepseek-v4-flash";
const relativePath = "synthetic/saveTask.ts";
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
  "generateAllNotesService() real AI integration",
  () => {
    it("generates complete stored file, section, and line notes", async () => {
      const apiKey = process.env.DEEPSEEK_API_KEY ?? process.env.VITE_DEEPSEEK_API_KEY;
      const modelDefinition = AI_CATALOG.deepseek.models.find(
        (model) => model.id === deepSeekModel,
      );

      expect(apiKey?.trim().length).toBeGreaterThan(0);
      expect(modelDefinition).toBeDefined();

      const result = await generateAllNotesService({
        sourceCode,
        relativePath,
        programmingLanguage,
        responseLanguageInstruction: "Respond in Simplified Chinese.",
        modelContextWindowTokens: modelDefinition!.contextWindowTokens,
        modelMaxOutputTokens: modelDefinition!.maxOutputTokens,
        createAiClient: (maxTokens) =>
          createDeepSeekClient({
            apiKey,
            model: deepSeekModel,
            maxTokens,
            timeoutMs: 180_000,
          }),
        now: "2026-07-15T00:00:00.000Z",
      });

      console.log(
        JSON.stringify(
          {
            model: deepSeekModel,
            relativePath,
            sourceLineCount: sourceCode.split(/\r?\n/).length,
            storedSourceFile: result,
          },
          null,
          2,
        ),
      );

      expect(result.source).toEqual({
        sourceHash: createSourceHash(sourceCode),
        programmingLanguage,
      });
      expect(result.fileNote).toMatchObject({
        id: "file",
        createdBy: "ai",
        status: { content: "current", anchor: "confirmed" },
      });
      expect(result.fileNote?.aiExplanation?.summary.trim().length).toBeGreaterThan(0);
      expect(result.fileNote?.aiExplanation?.detail.trim().length).toBeGreaterThan(0);
      expect(result.sectionNotes.length).toBeGreaterThan(0);
      expect(
        result.sectionNotes.every(
          (section) =>
            section.createdBy === "ai" &&
            section.title.trim().length > 0 &&
            section.anchorHash.length > 0 &&
            Boolean(section.aiExplanation?.summary.trim()) &&
            Boolean(section.aiExplanation?.detail.trim()),
        ),
      ).toBe(true);
      expect(result.lineNotes.map((line) => line.line)).toEqual([3, 4, 5, 8]);
      expect(
        result.lineNotes.every(
          (line) =>
            line.createdBy === "ai" &&
            line.anchorText === sourceCode.split(/\r?\n/)[line.line - 1] &&
            Boolean(line.aiExplanation?.summary.trim()) &&
            Boolean(line.aiExplanation?.detail.trim()),
        ),
      ).toBe(true);
    }, 210_000);
  },
);
