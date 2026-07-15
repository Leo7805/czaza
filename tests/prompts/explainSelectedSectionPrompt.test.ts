/**
 * Unit tests for selected-section AI prompt construction.
 */

import { describe, expect, it } from "vitest";

import { explainSelectedSectionPrompt } from "@shared/prompts/explainSelectedSectionPrompt";

describe("explainSelectedSectionPrompt()", () => {
  it("keeps the selected section identity while including full-file context", () => {
    const prompt = explainSelectedSectionPrompt({
      sourceCode: "function run() {\n  return true;\n}",
      filePath: "src/run.ts",
      programmingLanguage: "typescript",
      responseLanguageInstruction: "Respond in Simplified Chinese.",
      sectionTitle: "Run function",
      sectionKind: "function",
      sectionStartLine: 1,
      sectionEndLine: 3,
    });

    expect(prompt).toContain("Respond in Simplified Chinese.");
    expect(prompt).toContain("Return exactly one item in the sections array.");
    expect(prompt).toContain("Keep the selected section title, kind, and range unchanged");
    expect(prompt).toContain('"title": "Run function"');
    expect(prompt).toContain('"startLine": 1');
    expect(prompt).toContain("1: function run() {");
    expect(prompt).toContain("3: }");
  });
});
