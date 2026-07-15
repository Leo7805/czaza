/**
 * Unit tests for coordinated file, section, and line AI prompt construction.
 */

import { describe, expect, it } from "vitest";
import { explainFileSectionLinePrompt } from "@shared/prompts/explainFileSectionLinePrompt";

describe("explainFileSectionLinePrompt()", () => {
  it("includes all three DTO levels, shared context, and filtered line targets", () => {
    const prompt = explainFileSectionLinePrompt({
      sourceCode: [
        "import { save } from './save';",
        "export function run() {",
        "  return save();",
        "}",
      ].join("\n"),
      filePath: "src/run.ts",
      programmingLanguage: "typescript",
      responseLanguageInstruction: "Respond in Simplified Chinese.",
      lineNumbers: [2, 3],
    });

    expect(prompt).toContain("Respond in Simplified Chinese.");
    expect(prompt).toContain("- filePath: src/run.ts");
    expect(prompt).toContain("- VS Code language id: typescript");
    expect(prompt).toContain('"file": {');
    expect(prompt).toContain('"sections": [');
    expect(prompt).toContain('"lines": [');
    expect(prompt).toContain('"lineNumber": 2');
    expect(prompt).toContain("Target line numbers: [2,3]");
    expect(prompt).toContain("Return exactly one lines item for every target line number.");
    expect(prompt).toContain("Do not omit, duplicate, or add line numbers.");
    expect(prompt).toContain("same source context");
    expect(prompt).toContain("complementary rather than repeating identical text");
    expect(prompt).toContain("Return only valid JSON.");
    expect(prompt).toContain("Keep code identifiers");
    expect(prompt).toContain("Focus on what the code does and why it exists.");
    expect(prompt).toContain("aiNotes must contain useful extra context only when needed.");
    expect(prompt).not.toContain("1: import { save } from './save';");
    expect(prompt).toContain("2: export function run() {");
    expect(prompt).toContain("3:   return save();");
    expect(prompt).toContain("4: }");
    expect(countOccurrences(prompt, "import { save } from './save';")).toBe(0);
  });

  it("requires an empty line result when local filtering selects no lines", () => {
    const prompt = explainFileSectionLinePrompt({
      sourceCode: "// Comment only",
      filePath: "src/comment.ts",
      responseLanguageInstruction: "Respond in English.",
      lineNumbers: [],
    });

    expect(prompt).toContain("- VS Code language id: unknown");
    expect(prompt).toContain('"lines": []');
    expect(prompt).toContain("Target line numbers: []");
    expect(prompt).toContain('Return "lines": [] when the target line-number list is empty.');
  });
});

/** Counts non-overlapping occurrences of one string in a larger value. */
function countOccurrences(value: string, target: string): number {
  return value.split(target).length - 1;
}
