/**
 * Unit tests for selecting meaningful source lines for batch AI analysis.
 */

import { describe, expect, it } from "vitest";
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
      }),
    ).toEqual([{ lineNumber: 2, text: "int main(void) {" }]);

    expect(
      selectLineAnalysisCandidates({
        sourceText: "# include <vector>\nauto values = std::vector<int>{};",
        programmingLanguage: "cpp",
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
    });

    expect(result).toEqual([{ lineNumber: 7, text: "result = first()" }]);
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
