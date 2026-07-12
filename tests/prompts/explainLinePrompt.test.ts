/**
 * Unit tests for single-line AI prompt construction.
 */

import { describe, expect, it } from "vitest";
import { explainLinePrompt } from "@shared/prompts/explainLinePrompt";

describe("explainLinePrompt()", () => {
  it("includes response language, target line, surrounding lines, rules, and source metadata", () => {
    const prompt = explainLinePrompt({
      lineNumber: 3,
      sourceLine: "  return <button>Save</button>;",
      filePath: "src/Button.tsx",
      programmingLanguage: "typescriptreact",
      responseLanguageInstruction: "Respond in Simplified Chinese.",
      surroundingSourceLines: [
        {
          lineNumber: 2,
          text: "export function Button() {",
        },
        {
          lineNumber: 3,
          text: "  return <button>Save</button>;",
        },
        {
          lineNumber: 4,
          text: "}",
        },
      ],
    });

    expect(prompt).toContain("Respond in Simplified Chinese.");
    expect(prompt).toContain("- filePath: src/Button.tsx");
    expect(prompt).toContain("- VS Code language id: typescriptreact");
    expect(prompt).toContain("- target line: 3");
    expect(prompt).toContain("Return only a stable JSON object matching the line analysis DTO.");
    expect(prompt).toContain("Do not return file analysis, section analysis, token analysis");
    expect(prompt).toContain('"summary": ""');
    expect(prompt).toContain('"detail": ""');
    expect(prompt).toContain('"aiNotes": []');
    expect(prompt).toContain("Explain only the target line.");
    expect(prompt).toContain("Do not return the line number or source code in the JSON.");
    expect(prompt).toContain("Return only valid JSON.");
    expect(prompt).toContain("Line numbers are prefixes for reference only and are not part of the source code.");
    expect(prompt).toContain("3:   return <button>Save</button>;");
    expect(prompt).toContain("2: export function Button() {");
    expect(prompt).toContain("4: }");
  });

  it("uses the target line as surrounding context when surrounding lines are unavailable", () => {
    const prompt = explainLinePrompt({
      lineNumber: 1,
      sourceLine: "const value = 1;",
      filePath: "src/value.ts",
      responseLanguageInstruction: "Respond in English.",
    });

    expect(prompt).toContain("- VS Code language id: unknown");
    expect(prompt).toContain("1: const value = 1;");
  });
});
