/**
 * Unit tests for section-level AI prompt construction.
 */

import { describe, expect, it } from "vitest";
import { explainSectionPrompt } from "@shared/prompts/explainSectionPrompt";

describe("explainSectionPrompt()", () => {
  it("includes response language, source metadata, section rules, and source code", () => {
    const prompt = explainSectionPrompt({
      sourceCode: "export function Button() {\n  return <button>Save</button>;\n}",
      filePath: "src/Button.tsx",
      programmingLanguage: "typescriptreact",
      responseLanguageInstruction: "Respond in Simplified Chinese.",
    });

    expect(prompt).toContain("Respond in Simplified Chinese.");
    expect(prompt).toContain("- filePath: src/Button.tsx");
    expect(prompt).toContain("- VS Code language id: typescriptreact");
    expect(prompt).toContain("Return only a stable JSON object matching the section analysis DTO list.");
    expect(prompt).toContain("Do not return file analysis, line analysis, token analysis");
    expect(prompt).toContain('"sections"');
    expect(prompt).toContain('"title": ""');
    expect(prompt).toContain('"range"');
    expect(prompt).toContain('"startLine": 1');
    expect(prompt).toContain('"endLine": 1');
    expect(prompt).toContain("Use 1-based inclusive line numbers.");
    expect(prompt).toContain("Return only valid JSON.");
    expect(prompt).toContain("Do not include markdown fences.");
    expect(prompt).toContain("Keep code identifiers, API names, file names, package names");
    expect(prompt).toContain("Focus on what the code does and why it exists.");
    expect(prompt).toContain("Use aiNotes for risks, assumptions, edge cases");
    expect(prompt).toContain("Line numbers are prefixes for reference only and are not part of the source code.");
    expect(prompt).toContain("1: export function Button()");
    expect(prompt).toContain("2:   return <button>Save</button>;");
  });

  it("uses unknown language id when optional source metadata is unavailable", () => {
    const prompt = explainSectionPrompt({
      sourceCode: "plain text",
      filePath: "README",
      responseLanguageInstruction: "Respond in English.",
    });

    expect(prompt).toContain("- VS Code language id: unknown");
  });

  it("omits configured dependency directives from structured source context", () => {
    const prompt = explainSectionPrompt({
      sourceCode: 'import value from "./value";\nexport const result = value;',
      filePath: "src/value.ts",
      programmingLanguage: "typescript",
      responseLanguageInstruction: "Respond in English.",
    });

    expect(prompt).not.toContain('1: import value from "./value";');
    expect(prompt).toContain("2: export const result = value;");
  });
});
