/**
 * Unit tests for combined file and section AI prompt construction.
 */

import { describe, expect, it } from "vitest";
import { explainFileSectionPrompt } from "@shared/prompts/explainFileSectionPrompt";

describe("explainFileSectionPrompt()", () => {
  it("includes response language, source metadata, combined JSON shape, rules, and numbered source code", () => {
    const prompt = explainFileSectionPrompt({
      sourceCode: "export function Button() {\n  return <button>Save</button>;\n}",
      filePath: "src/Button.tsx",
      programmingLanguage: "typescriptreact",
      responseLanguageInstruction: "Respond in Simplified Chinese.",
    });

    expect(prompt).toContain("Respond in Simplified Chinese.");
    expect(prompt).toContain("- filePath: src/Button.tsx");
    expect(prompt).toContain("- VS Code language id: typescriptreact");
    expect(prompt).toContain("Return only a stable JSON object matching the combined file and section analysis DTO.");
    expect(prompt).toContain("Do not return line analysis, token analysis");
    expect(prompt).toContain('"file"');
    expect(prompt).toContain('"sections"');
    expect(prompt).toContain('"summary": ""');
    expect(prompt).toContain('"detail": ""');
    expect(prompt).toContain('"aiNotes": []');
    expect(prompt).toContain('"startLine": 1');
    expect(prompt).toContain('"endLine": 1');
    expect(prompt).toContain("file.summary must be concise");
    expect(prompt).toContain("Use 1-based inclusive line numbers.");
    expect(prompt).toContain("Return only valid JSON.");
    expect(prompt).toContain("Line numbers are prefixes for reference only and are not part of the source code.");
    expect(prompt).toContain("1: export function Button()");
    expect(prompt).toContain("2:   return <button>Save</button>;");
  });

  it("uses unknown language id when optional source metadata is unavailable", () => {
    const prompt = explainFileSectionPrompt({
      sourceCode: "plain text",
      filePath: "README",
      responseLanguageInstruction: "Respond in English.",
    });

    expect(prompt).toContain("- VS Code language id: unknown");
  });

  it("omits configured dependency directives from structured source context", () => {
    const prompt = explainFileSectionPrompt({
      sourceCode: 'import value from "./value";\nexport const result = value;',
      filePath: "src/value.ts",
      programmingLanguage: "typescript",
      responseLanguageInstruction: "Respond in English.",
    });

    expect(prompt).not.toContain('1: import value from "./value";');
    expect(prompt).toContain("2: export const result = value;");
  });
});
