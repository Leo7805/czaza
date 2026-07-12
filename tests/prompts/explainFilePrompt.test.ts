/**
 * Unit tests for file-level AI prompt construction.
 */

import { describe, expect, it } from "vitest";
import { explainFilePrompt } from "@shared/prompts/explainFilePrompt";

describe("explainFilePrompt()", () => {
  it("includes response language, source metadata, file-only rules, and source code", () => {
    const prompt = explainFilePrompt({
      sourceCode: "export function Button() {\n  return <button>Save</button>;\n}",
      filePath: "src/Button.tsx",
      programmingLanguage: "typescriptreact",
      responseLanguageInstruction: "Respond in Simplified Chinese.",
    });

    expect(prompt).toContain("Respond in Simplified Chinese.");
    expect(prompt).toContain("- filePath: src/Button.tsx");
    expect(prompt).toContain("- VS Code language id: typescriptreact");
    expect(prompt).toContain("Return only a stable JSON object matching the file analysis DTO.");
    expect(prompt).toContain("Do not return section analysis, line analysis, token analysis");
    expect(prompt).toContain('"summary": ""');
    expect(prompt).toContain('"detail": ""');
    expect(prompt).toContain('"aiNotes": []');
    expect(prompt).toContain("Return only valid JSON.");
    expect(prompt).toContain("Do not include markdown fences.");
    expect(prompt).toContain("Keep code identifiers, API names, file names, package names");
    expect(prompt).toContain("Focus on what the code does and why it exists.");
    expect(prompt).toContain("Use aiNotes for risks, assumptions, edge cases");
    expect(prompt).toContain("export function Button()");
    expect(prompt).toContain("return <button>Save</button>;");
  });

  it("uses unknown when the VS Code language id is unavailable", () => {
    const prompt = explainFilePrompt({
      sourceCode: "plain text",
      filePath: "README",
      responseLanguageInstruction: "Respond in English.",
    });

    expect(prompt).toContain("- VS Code language id: unknown");
  });
});
