import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseStructureUnits } from "@shared/parser/structureUnitParser";
import { explainFileStructurePrompt } from "@shared/prompts/explainFileStructurePrompt";
import { deepSeekClient } from "@shared/providers/deepseek";
import { parseAiJson } from "@shared/services/explainUtils";
import { loadEnvFile } from "./realAiTestUtils";

const shouldRunRealAiTest = process.env.RUN_REAL_AI_TEST === "true";
const benchmarkFilePath = "shared/parser/typescriptParser.ts";
const benchmarkLanguage = "ts";

if (shouldRunRealAiTest) {
  loadEnvFile(".env.local");
}

describe.skipIf(!shouldRunRealAiTest)("DeepSeek real benchmark", () => {
  it("measures the minimal ping request", async () => {
    const prompt = `Return only this JSON object: {"ok": true}`;
    const result = await measureDeepSeekRequest("ping", prompt);
    const json = parseJsonResult(result.responseText);

    printBenchmarkResult(result, json);

    expect(json).toEqual({ ok: true });
  }, 90_000);

  it("measures file-only explanation speed", async () => {
    const sourceCode = readFileSync(benchmarkFilePath, "utf-8");
    const prompt = createFileOnlyPrompt(sourceCode);
    const result = await measureDeepSeekRequest("file-only", prompt);
    const json = parseJsonResult(result.responseText);

    printBenchmarkResult(result, json);

    expect(getNestedString(json, ["file", "explanation", "summary"]).trim().length).toBeGreaterThan(0);
  }, 90_000);

  it("measures file plus structure explanation speed", async () => {
    const sourceCode = readFileSync(benchmarkFilePath, "utf-8");
    const structureUnits = parseStructureUnits({
      sourceCode,
      language: benchmarkLanguage,
      filePath: benchmarkFilePath,
    });
    const prompt = createFileStructurePrompt(sourceCode, structureUnits);
    const result = await measureDeepSeekRequest("file-plus-structure", prompt);
    const json = parseJsonResult(result.responseText);

    printBenchmarkResult(result, json);

    expect(getNestedString(json, ["file", "explanation", "summary"]).trim().length).toBeGreaterThan(0);
    expect(Array.isArray((json as Record<string, unknown>).structureUnits)).toBe(true);
  }, 90_000);
});

type BenchmarkResult = {
  label: string;
  durationMs: number;
  promptCharacters: number;
  responseCharacters: number;
  responseText: string;
};

async function measureDeepSeekRequest(label: string, prompt: string): Promise<BenchmarkResult> {
  const startTime = performance.now();
  const responseText = await deepSeekClient.complete(prompt);
  const durationMs = Math.round(performance.now() - startTime);

  return {
    label,
    durationMs,
    promptCharacters: prompt.length,
    responseCharacters: responseText.length,
    responseText,
  };
}

function createFileOnlyPrompt(sourceCode: string): string {
  return `
You are benchmarking DeepSeek for CZaza.

Return only valid JSON. Do not include markdown fences or extra text.
Write explanation text in Simplified Chinese.
Keep code identifiers in English.

Task:
Explain the whole file only. Do not return structureUnits, semanticUnits, lines, or tokenUnits.

Required JSON shape:
{
  "file": {
    "explanation": {
      "summary": "",
      "detail": "",
      "aiNotes": []
    }
  }
}

File:
- language: ${benchmarkLanguage}
- filePath: ${benchmarkFilePath}

Source code:
\`\`\`${benchmarkLanguage}
${sourceCode}
\`\`\`
`;
}

function createFileStructurePrompt(sourceCode: string, structureUnits: ReturnType<typeof parseStructureUnits>): string {
  return explainFileStructurePrompt({
    code: sourceCode,
    language: benchmarkLanguage,
    mode: "file-structure",
    filePath: benchmarkFilePath,
    structureUnits,
  });
}

function printBenchmarkResult(result: BenchmarkResult, json: unknown): void {
  console.log(
    JSON.stringify(
      {
        label: result.label,
        durationMs: result.durationMs,
        durationSeconds: Number((result.durationMs / 1000).toFixed(2)),
        promptCharacters: result.promptCharacters,
        responseCharacters: result.responseCharacters,
        json,
      },
      null,
      2,
    ),
  );
}

function parseJsonResult(value: string): unknown {
  return parseAiJson(value);
}

function getNestedString(value: unknown, path: string[]): string {
  let current = value;

  for (const key of path) {
    if (!current || typeof current !== "object") {
      return "";
    }

    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" ? current : "";
}
