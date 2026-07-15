/**
 * Unit tests for selecting meaningful source lines for batch AI analysis.
 */

import { describe, expect, it } from "vitest";
import { AI_REQUEST_DEFAULTS } from "@shared/config/aiRequestDefaults";
import { selectLineAnalysisCandidates } from "@shared/services/lineAnalysisCandidateService";

describe("selectLineAnalysisCandidates()", () => {
  it("removes blank, delimiter-only, and comment-only lines without changing line numbers", () => {
    const result = selectLineAnalysisCandidates({
      sourceText: [
        "",
        "// Explains the next declaration.",
        "const value = 1;",
        "{",
        "/* block",
        " * comment",
        " */",
        "return value;",
        "});",
      ].join("\n"),
      programmingLanguage: "typescript",
    });

    expect(result).toEqual([
      { lineNumber: 3, text: "const value = 1;" },
      { lineNumber: 8, text: "return value;" },
    ]);
  });

  it("keeps code that appears before or after a block comment", () => {
    const result = selectLineAnalysisCandidates({
      sourceText: [
        "const first = 1; /* trailing comment",
        " * comment continuation",
        " */ const second = 2;",
      ].join("\n"),
      programmingLanguage: "javascript",
    });

    expect(result).toEqual([
      { lineNumber: 1, text: "const first = 1; /* trailing comment" },
      { lineNumber: 3, text: " */ const second = 2;" },
    ]);
  });

  it("removes C and C++ include directives", () => {
    expect(
      selectLineAnalysisCandidates({
        sourceText: "#include <stdio.h>\nint main(void) {",
        programmingLanguage: "c",
        skipDependencyDirectives: true,
      }),
    ).toEqual([{ lineNumber: 2, text: "int main(void) {" }]);

    expect(
      selectLineAnalysisCandidates({
        sourceText: "# include <vector>\nauto values = std::vector<int>{};",
        programmingLanguage: "cpp",
        skipDependencyDirectives: true,
      }),
    ).toEqual([{ lineNumber: 2, text: "auto values = std::vector<int>{};" }]);
  });

  it("removes C# using directives but keeps using statements and declarations", () => {
    const result = selectLineAnalysisCandidates({
      sourceText: [
        "using System.Text;",
        "global using Alias = Project.Services;",
        "using (var stream = Open())",
        "using Stream stream = Open();",
      ].join("\n"),
      programmingLanguage: "csharp",
      skipDependencyDirectives: true,
    });

    expect(result).toEqual([
      { lineNumber: 3, text: "using (var stream = Open())" },
      { lineNumber: 4, text: "using Stream stream = Open();" },
    ]);
  });

  it("removes single-line and parenthesized Python imports and Python comments", () => {
    const result = selectLineAnalysisCandidates({
      sourceText: [
        "import os",
        "from package import (",
        "    first,",
        "    second,",
        ")",
        "# Create the result.",
        "result = first()",
      ].join("\n"),
      programmingLanguage: "python",
      skipDependencyDirectives: true,
    });

    expect(result).toEqual([{ lineNumber: 7, text: "result = first()" }]);
  });

  it("removes single-line and multiline ECMAScript static imports", () => {
    const result = selectLineAnalysisCandidates({
      sourceText: [
        'import React from "react";',
        'import "./styles.css";',
        "import {",
        "  first,",
        "  second,",
        '} from "./values";',
        "const result = first(second);",
      ].join("\n"),
      programmingLanguage: "typescriptreact",
      skipDependencyDirectives: true,
    });

    expect(result).toEqual([
      { lineNumber: 7, text: "const result = first(second);" },
    ]);
  });

  it("applies ECMAScript import rules to JavaScript and TypeScript language ids", () => {
    for (const programmingLanguage of [
      "javascript",
      "javascriptreact",
      "typescript",
      "typescriptreact",
    ]) {
      expect(
        selectLineAnalysisCandidates({
          sourceText: 'import value from "./value";\nuse(value);',
          programmingLanguage,
          skipDependencyDirectives: true,
        }),
      ).toEqual([{ lineNumber: 2, text: "use(value);" }]);
    }
  });

  it("keeps dynamic imports and import.meta expressions", () => {
    const result = selectLineAnalysisCandidates({
      sourceText: [
        'const module = await import("./module");',
        "const url = import.meta.url;",
      ].join("\n"),
      programmingLanguage: "typescript",
    });

    expect(result).toEqual([
      { lineNumber: 1, text: 'const module = await import("./module");' },
      { lineNumber: 2, text: "const url = import.meta.url;" },
    ]);
  });

  it("does not apply dependency filtering unless a caller enables it", () => {
    expect(AI_REQUEST_DEFAULTS.lineAnalysis.skipDependencyDirectives.enabled).toBe(true);

    const result = selectLineAnalysisCandidates({
      sourceText: 'import value from "./value";\nuse(value);',
      programmingLanguage: "typescript",
    });

    expect(result).toEqual([
      { lineNumber: 1, text: 'import value from "./value";' },
      { lineNumber: 2, text: "use(value);" },
    ]);
  });

  it("uses only generic rules for an unknown language", () => {
    const result = selectLineAnalysisCandidates({
      sourceText: "import dependency\n// comment\nrun dependency",
      programmingLanguage: "custom-language",
    });

    expect(result).toEqual([
      { lineNumber: 1, text: "import dependency" },
      { lineNumber: 3, text: "run dependency" },
    ]);
  });
});
