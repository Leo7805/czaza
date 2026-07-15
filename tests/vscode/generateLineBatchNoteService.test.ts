/**
 * Unit tests for nearby line-batch generation and metadata preservation.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  workspace: {
    openTextDocument: vi.fn(),
  },
}));

import { generateLineBatchNotesService } from "@vscode/services/generateLineBatchNoteService";

const sourceCode = "const first = 1;\nconst second = 2;\nconst third = 3;";

describe("generateLineBatchNotesService()", () => {
  it("generates only missing nearby line notes in one AI request", async () => {
    const complete = vi.fn().mockResolvedValue(
      JSON.stringify({
        lines: [
          { lineNumber: 1, summary: "First.", detail: "Defines the first value." },
          { lineNumber: 3, summary: "Third.", detail: "Defines the third value." },
        ],
      }),
    );

    const result = await generateLineBatchNotesService({
      sourceCode,
      activeLine: 2,
      relativePath: "src/value.ts",
      programmingLanguage: "typescript",
      responseLanguageInstruction: "Respond in English.",
      existingLineNotes: [createExistingLineNote()],
      onlyMissing: true,
      usedLineNoteIds: ["line:2"],
      aiClient: { complete },
      now: "2026-07-15T00:00:00.000Z",
    });

    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0]?.[0]).toContain("1: const first = 1;");
    expect(complete.mock.calls[0]?.[0]).toContain("3: const third = 3;");
    expect(complete.mock.calls[0]?.[0]).not.toContain("2: const second = 2;");
    expect(result.map((note) => note.line)).toEqual([1, 3]);
  });

  it("regenerates all nearby lines and preserves existing line metadata", async () => {
    const complete = vi.fn().mockResolvedValue(
      JSON.stringify({
        lines: [
          { lineNumber: 1, summary: "First updated.", detail: "Updated first value." },
          { lineNumber: 2, summary: "Second updated.", detail: "Updated second value." },
          { lineNumber: 3, summary: "Third updated.", detail: "Updated third value." },
        ],
      }),
    );
    const existing = createExistingLineNote();

    const result = await generateLineBatchNotesService({
      sourceCode,
      activeLine: 2,
      relativePath: "src/value.ts",
      programmingLanguage: "typescript",
      responseLanguageInstruction: "Respond in English.",
      existingLineNotes: [existing],
      onlyMissing: false,
      usedLineNoteIds: [existing.id],
      aiClient: { complete },
      now: "2026-07-15T00:00:00.000Z",
    });

    expect(complete.mock.calls[0]?.[0]).toContain("2: const second = 2;");
    expect(result.find((note) => note.line === 2)).toMatchObject({
      id: existing.id,
      userNote: "Keep this note.",
      createdAt: existing.createdAt,
      aiExplanation: { summary: "Second updated." },
    });
  });
});

function createExistingLineNote() {
  return {
    id: "line:2",
    line: 2,
    anchorText: "const second = 2;",
    userNote: "Keep this note.",
    aiExplanation: { summary: "Second.", detail: "Defines the second value." },
    status: { content: "current", anchor: "confirmed" } as const,
    createdBy: "ai" as const,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
  };
}
