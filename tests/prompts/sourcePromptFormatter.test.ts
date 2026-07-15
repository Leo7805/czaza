/**
 * Unit tests for structured prompt source formatting.
 */

import { describe, expect, it } from "vitest";
import { formatSourceCodeForStructuredAnalysisPrompt } from "@shared/prompts/sourcePromptFormatter";

describe("formatSourceCodeForStructuredAnalysisPrompt()", () => {
  it("keeps original line numbers while removing configured dependency directives", () => {
    const result = formatSourceCodeForStructuredAnalysisPrompt({
      sourceCode: [
        'import React from "react";',
        "import {",
        "  save,",
        '} from "./save";',
        "export function run() {",
        "  return save();",
        "}",
      ].join("\n"),
      programmingLanguage: "typescriptreact",
      skipDependencyDirectives: true,
    });

    expect(result).toBe(
      ["5: export function run() {", "6:   return save();", "7: }"].join("\n"),
    );
  });

  it("keeps dependency directives when filtering is disabled", () => {
    const result = formatSourceCodeForStructuredAnalysisPrompt({
      sourceCode: 'import value from "./value";\nuse(value);',
      programmingLanguage: "typescript",
      skipDependencyDirectives: false,
    });

    expect(result).toContain('1: import value from "./value";');
    expect(result).toContain("2: use(value);");
  });
});
