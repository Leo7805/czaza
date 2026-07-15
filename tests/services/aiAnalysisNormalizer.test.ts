/**
 * Unit tests for reusable AI response and DTO normalizers.
 */

import { describe, expect, it } from "vitest";
import {
  normalizeFileAnalysis,
  normalizeLineAnalysis,
  normalizeLineAnalysisEntries,
  normalizeSectionAnalyses,
} from "@shared/services/normalizers/aiAnalysisNormalizer";
import {
  parseAiJsonObject,
  toRecord,
} from "@shared/services/normalizers/aiResponseNormalizer";

describe("AI analysis normalizers", () => {
  it("extracts a fenced JSON object with surrounding text", () => {
    const result = parseAiJsonObject('Result:\n```json\n{"file":{"summary":"ok"}}\n```');

    expect(toRecord(result)).toEqual({ file: { summary: "ok" } });
  });

  it("normalizes file and line explanations with string-only aiNotes", () => {
    expect(
      normalizeFileAnalysis({
        summary: "Loads configuration.",
        detail: "The file reads and validates settings.",
        aiNotes: ["Uses defaults.", 1, null],
      }),
    ).toEqual({
      summary: "Loads configuration.",
      detail: "The file reads and validates settings.",
      aiNotes: ["Uses defaults."],
    });

    expect(
      normalizeLineAnalysis({
        summary: "Returns the result.",
        detail: "The line returns the validated value.",
        aiNotes: [],
      }),
    ).toEqual({
      summary: "Returns the result.",
      detail: "The line returns the validated value.",
    });
  });

  it("rejects an explanation without required text using the supplied error context", () => {
    expect(() =>
      normalizeFileAnalysis(
        { summary: "", detail: "Missing summary." },
        { responseName: "all notes analysis", fieldName: "file" },
      ),
    ).toThrow(
      "Invalid all notes analysis response: file.summary and file.detail are required.",
    );
  });

  it("validates and sorts sections by their one-based source range", () => {
    const result = normalizeSectionAnalyses(
      [
        {
          title: "Second",
          kind: "function",
          range: { startLine: 8, endLine: 12 },
          summary: "Runs second.",
          detail: "The second section runs after setup.",
          aiNotes: [],
        },
        {
          title: "First",
          kind: "",
          range: { startLine: "2", endLine: "6" },
          summary: "Runs first.",
          detail: "The first section initializes state.",
          aiNotes: ["Initialization order matters."],
        },
      ],
      { lineCount: 12 },
    );

    expect(result.map((section) => section.title)).toEqual(["First", "Second"]);
    expect(result[0]).toMatchObject({
      range: { startLine: 2, endLine: 6 },
      aiNotes: ["Initialization order matters."],
    });
    expect(result[0]).not.toHaveProperty("kind");
  });

  it("rejects a section outside the current source line count", () => {
    expect(() =>
      normalizeSectionAnalyses(
        [
          {
            title: "Outside",
            range: { startLine: 5, endLine: 11 },
            summary: "Exceeds the file.",
            detail: "The returned range extends beyond the current source.",
          },
        ],
        { lineCount: 10 },
      ),
    ).toThrow(
      "Invalid section analysis response: section 0 requires title, range, summary, and detail.",
    );
  });

  it("normalizes a complete line batch and rejects missing or duplicate targets", () => {
    const complete = normalizeLineAnalysisEntries(
      [
        {
          lineNumber: 3,
          summary: "Returns a value.",
          detail: "The line returns the computed result.",
        },
        {
          lineNumber: 2,
          summary: "Computes a value.",
          detail: "The line invokes the value factory.",
        },
      ],
      { requestedLineNumbers: [2, 3] },
    );

    expect(complete.map((line) => line.lineNumber)).toEqual([2, 3]);

    expect(() =>
      normalizeLineAnalysisEntries(complete.slice(0, 1), {
        requestedLineNumbers: [2, 3],
      }),
    ).toThrow("expected exactly one result for requested lineNumbers 2, 3");

    expect(() =>
      normalizeLineAnalysisEntries([complete[0], complete[0]], {
        requestedLineNumbers: [2],
      }),
    ).toThrow("duplicate lineNumber 2");
  });
});
