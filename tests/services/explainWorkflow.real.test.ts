import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deepSeekClient } from "@shared/providers/deepseek";
import { explainFileStructureService } from "@shared/services/explainFileStructureService";
import { explainLineRangeService } from "@shared/services/explainLineRangeService";
import { explainSemanticService } from "@shared/services/explainSemanticService";
import { loadEnvFile } from "./realAiTestUtils";

const shouldRunRealAiTest = process.env.RUN_REAL_AI_TEST === "true";

if (shouldRunRealAiTest) {
  loadEnvFile(".env.local");
}

describe.skipIf(!shouldRunRealAiTest)("explain workflow real AI integration", () => {
  it("runs file+structure, semantic, and line+token stages", async () => {
    const filePath = "shared/parser/typescriptParser.ts";
    const sourceCode = readFileSync(filePath, "utf-8");

    const fileStructure = await explainFileStructureService(
      {
        sourceCode,
        filePath,
        language: "ts",
      },
      deepSeekClient,
    );

    const semanticUnits = await explainSemanticService(
      {
        sourceCode,
        filePath,
        language: "ts",
        context: fileStructure,
      },
      deepSeekClient,
    );

    const context = {
      ...fileStructure,
      semanticUnits,
    };
    const lines = await explainLineRangeService(
      {
        sourceCode,
        filePath,
        language: "ts",
        range: {
          startLine: 1,
          endLine: 8,
        },
        context,
      },
      deepSeekClient,
    );

    const result = {
      ...context,
      lines,
    };

    console.log(JSON.stringify(result, null, 2));

    expect(result.file.explanation.summary.trim().length).toBeGreaterThan(0);
    expect(result.structureUnits.length).toBeGreaterThan(0);
    expect(result.structureUnits.every((unit) => unit.explanation.summary.trim().length > 0)).toBe(
      true,
    );
    expect(Array.isArray(result.semanticUnits)).toBe(true);
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.lines.every((line) => line.code.trim().length > 0)).toBe(true);
  }, 180_000);
});
