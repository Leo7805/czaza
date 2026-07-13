/**
 * Unit tests for AI-to-domain note conversion.
 */

import { describe, expect, it } from "vitest";
import type { FileSectionAnalysis } from "@shared/services/explainFileSectionService";
import type { LineAnalysisEntry } from "@shared/models/ai/line";
import type { SectionAnalysis } from "@shared/models/ai/section";
import {
  createFileNoteFromAiAnalysis,
  createFileSectionNotesFromAiAnalysis,
  createLineNoteFromAiAnalysis,
  createLineNotesFromAiBatchAnalysis,
  createSectionNoteFromAiAnalysis,
  createSectionNotesFromAiAnalysis,
  getSourceRangeText,
} from "@shared/services/aiToDomainService";
import { createSourceHash } from "@shared/utils/hashUtils";

describe("aiToDomainService", () => {
  it("creates a file note from file AI analysis", () => {
    const note = createFileNoteFromAiAnalysis({
      summary: "Defines settings.",
      detail: "Reads and validates extension settings.",
      aiNotes: ["API keys are not stored here."],
    });

    console.log("File note from AI analysis:", JSON.stringify(note, null, 2));

    expect(note).toEqual({
      id: "file",
      aiExplanation: {
        summary: "Defines settings.",
        detail: "Reads and validates extension settings.",
        aiNotes: ["API keys are not stored here."],
      },
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "ai",
    });
  });

  it("creates a section note with a source anchor hash", () => {
    const sourceLines = [
      "const label = 'Save';",
      "return <button>{label}</button>;",
    ];
    const analysis: SectionAnalysis = {
      title: "Button rendering",
      kind: "component-rendering",
      range: {
        startLine: 1,
        endLine: 2,
      },
      summary: "Renders a button.",
      detail: "Uses the label constant to render a button.",
      aiNotes: ["The range is inclusive."],
    };

    const note = createSectionNoteFromAiAnalysis(analysis, sourceLines);

    console.log("Section note from AI analysis:", JSON.stringify(note, null, 2));

    expect(note).toEqual({
      id: "section:1:button-rendering:1-2",
      title: "Button rendering",
      kind: "component-rendering",
      range: {
        startLine: 1,
        endLine: 2,
      },
      anchorHash: createSourceHash(sourceLines.join("\n")),
      aiExplanation: {
        summary: "Renders a button.",
        detail: "Uses the label constant to render a button.",
        aiNotes: ["The range is inclusive."],
      },
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "ai",
    });
  });

  it("creates section notes with stable ids when titles repeat", () => {
    const sourceLines = ["const first = 1;", "const second = 2;"];
    const analyses: SectionAnalysis[] = [
      {
        title: "Repeated",
        range: {
          startLine: 1,
          endLine: 1,
        },
        summary: "Explains the first line.",
        detail: "The first line defines a constant.",
      },
      {
        title: "Repeated",
        range: {
          startLine: 2,
          endLine: 2,
        },
        summary: "Explains the second line.",
        detail: "The second line defines a constant.",
      },
    ];

    const notes = createSectionNotesFromAiAnalysis(analyses, sourceLines);

    expect(notes.map((note) => note.id)).toEqual([
      "section:1:repeated:1-1",
      "section:2:repeated:2-2",
    ]);
  });

  it("creates a line note from line AI analysis", () => {
    const note = createLineNoteFromAiAnalysis(
      2,
      {
        summary: "Returns JSX.",
        detail: "Returns a button element.",
      },
      ["const label = 'Save';", "return <button>{label}</button>;"],
    );

    expect(note).toEqual({
      id: "line:2",
      line: 2,
      anchorText: "return <button>{label}</button>;",
      aiExplanation: {
        summary: "Returns JSX.",
        detail: "Returns a button element.",
      },
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "ai",
    });
  });

  it("creates line notes from batch line AI analysis without storing lineNumber in aiExplanation", () => {
    const entries: LineAnalysisEntry[] = [
      {
        lineNumber: 1,
        summary: "Defines a label.",
        detail: "Stores the button label.",
      },
      {
        lineNumber: 2,
        summary: "Returns JSX.",
        detail: "Returns a button element.",
      },
    ];

    const notes = createLineNotesFromAiBatchAnalysis(entries, [
      "const label = 'Save';",
      "return <button>{label}</button>;",
    ]);

    console.log("Line notes from batch AI analysis:", JSON.stringify(notes, null, 2));

    expect(notes).toEqual([
      {
        id: "line:1",
        line: 1,
        anchorText: "const label = 'Save';",
        aiExplanation: {
          summary: "Defines a label.",
          detail: "Stores the button label.",
        },
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "ai",
      },
      {
        id: "line:2",
        line: 2,
        anchorText: "return <button>{label}</button>;",
        aiExplanation: {
          summary: "Returns JSX.",
          detail: "Returns a button element.",
        },
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "ai",
      },
    ]);
  });

  it("creates file and section notes from combined AI analysis", () => {
    const analysis: FileSectionAnalysis = {
      file: {
        summary: "Defines a component.",
        detail: "The file exports a small component.",
      },
      sections: [
        {
          title: "Component body",
          range: {
            startLine: 1,
            endLine: 1,
          },
          summary: "Returns null.",
          detail: "The component currently renders nothing.",
        },
      ],
    };

    const result = createFileSectionNotesFromAiAnalysis(analysis, ["return null;"]);

    console.log("File and section notes from combined AI analysis:", JSON.stringify(result, null, 2));

    expect(result.fileNote.id).toBe("file");
    expect(result.sectionNotes).toHaveLength(1);
    expect(result.sectionNotes[0]?.anchorHash).toBe(createSourceHash("return null;"));
  });

  it("throws when a section range cannot anchor to the current source", () => {
    const analysis: SectionAnalysis = {
      title: "Missing range",
      range: {
        startLine: 1,
        endLine: 3,
      },
      summary: "Explains unavailable lines.",
      detail: "The requested range exceeds the source file.",
    };

    expect(() => createSectionNoteFromAiAnalysis(analysis, ["const value = 1;"])).toThrow(
      "Invalid source range: endLine exceeds source line count.",
    );
  });

  it("reads inclusive source range text", () => {
    expect(getSourceRangeText(["a", "b", "c"], 2, 3)).toBe("b\nc");
  });
});
