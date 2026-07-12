/**
 * Unit tests for batch line AI prompt construction.
 */

import { describe, expect, it } from "vitest";
import { explainLineBatchPrompt } from "@shared/prompts/explainLineBatchPrompt";

describe("explainLineBatchPrompt()", () => {
  it("includes response language, source metadata, line rules, and numbered source lines", () => {
    const prompt = explainLineBatchPrompt({
      sourceLines: [
        {
          lineNumber: 2,
          text: "const label = 'Save';",
        },
        {
          lineNumber: 3,
          text: "return <button>{label}</button>;",
        },
      ],
      filePath: "src/Button.tsx",
      programmingLanguage: "typescriptreact",
      responseLanguageInstruction: "Respond in Simplified Chinese.",
    });

    expect(prompt).toContain("Respond in Simplified Chinese.");
    expect(prompt).toContain("- filePath: src/Button.tsx");
    expect(prompt).toContain("- VS Code language id: typescriptreact");
    expect(prompt).toContain("Return only a stable JSON object matching the batch line analysis DTO list.");
    expect(prompt).toContain("Do not return file analysis, section analysis, token analysis");
    expect(prompt).toContain('"lines"');
    expect(prompt).toContain('"lineNumber": 1');
    expect(prompt).toContain('"summary": ""');
    expect(prompt).toContain('"detail": ""');
    expect(prompt).toContain('"aiNotes": []');
    expect(prompt).toContain("Preserve each provided lineNumber exactly.");
    expect(prompt).toContain("Do not return source code in the JSON.");
    expect(prompt).toContain("Return only valid JSON.");
    expect(prompt).toContain("2: const label = 'Save';");
    expect(prompt).toContain("3: return <button>{label}</button>;");
  });

  it("uses unknown language id when optional source metadata is unavailable", () => {
    const prompt = explainLineBatchPrompt({
      sourceLines: [
        {
          lineNumber: 1,
          text: "plain text",
        },
      ],
      filePath: "README",
      responseLanguageInstruction: "Respond in English.",
    });

    expect(prompt).toContain("- VS Code language id: unknown");
  });
});
