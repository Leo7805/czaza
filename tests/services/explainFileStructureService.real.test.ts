import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deepSeekClient } from "@shared/providers/deepseek";
import { explainFileStructureService } from "@shared/services/explainFileStructureService";
import { loadEnvFile } from "./realAiTestUtils";

const shouldRunRealAiTest = process.env.RUN_REAL_AI_TEST === "true";

if (shouldRunRealAiTest) {
  loadEnvFile(".env.local");
}

describe.skipIf(!shouldRunRealAiTest)("explainFileStructureService() real AI integration", () => {
  it("calls DeepSeek and prints the complete normalized CodeExplanation", async () => {
    const filePath = "tests/services/deepseekBenchmark.real.test.ts";
    const sourceCode = readFileSync(filePath, "utf-8");
    const userNote = "用户补充：这个文件用于测试 DeepSeek 的真实响应速度。";

    const result = await explainFileStructureService(
      {
        sourceCode,
        filePath,
        language: "ts",
        mode: "file-structure",
        userNote,
      },
      deepSeekClient,
    );

    console.log(JSON.stringify(result, null, 2));

    expect(result.language).toBe("ts");
    expect(result.userNote).toBe(userNote);
    expect(result.file.explanation.summary.trim().length).toBeGreaterThan(0);
    expect(result.file.explanation.detail.trim().length).toBeGreaterThan(0);
    expect(result.file.explanation.userNotes).toEqual([userNote]);
    expect(result.structureUnits.length).toBeGreaterThan(0);
    expect(result.structureUnits.every((unit) => unit.explanation.summary.trim().length > 0)).toBe(
      true,
    );
    expect(result.semanticUnits).toEqual([]);
    expect(result.lines).toBeUndefined();
  }, 90_000);
});
