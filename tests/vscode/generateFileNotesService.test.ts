/**
 * Unit tests for file and section generation with a fake AI client.
 */

import type { AiClient } from "@shared/ai/aiClient";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({}));

import { generateFileNotesService } from "@vscode/services/generateFileNotesService";

const now = "2026-07-14T00:00:00.000Z";

describe("generateFileNotesService()", () => {
  it("creates file and section notes from fake AI JSON", async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify(createAiResponse()));
    const result = await generateFileNotesService({
      sourceCode: 'import value from "./value";\nexport function add(a: number, b: number) {\n  return a + b;\n}',
      relativePath: "src/add.ts",
      programmingLanguage: "typescript",
      responseLanguageInstruction: "Respond in English.",
      aiClient: { complete },
      now,
    });

    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0]?.[0]).toContain("src/add.ts");
    expect(complete.mock.calls[0]?.[0]).not.toContain('1: import value from "./value";');
    expect(complete.mock.calls[0]?.[0]).toContain("2: export function add");
    expect(result.fileNote?.aiExplanation?.summary).toBe("Adds two numbers.");
    expect(result.sectionNotes).toHaveLength(1);
    expect(result.sectionNotes[0]).toMatchObject({
      title: "Add function",
      range: { startLine: 1, endLine: 3 },
      createdBy: "ai",
    });
    expect(result.lineNotes).toEqual([]);
  });

  it("preserves user content and line notes while replacing AI analysis", async () => {
    const existing = createExistingSourceFile();
    const aiClient: AiClient = {
      complete: vi.fn().mockResolvedValue(JSON.stringify(createAiResponse())),
    };
    const result = await generateFileNotesService({
      sourceCode: "export function add(a: number, b: number) {\n  return a + b;\n}",
      relativePath: "src/add.ts",
      programmingLanguage: "typescript",
      responseLanguageInstruction: "Respond in English.",
      aiClient,
      existingSourceFile: existing,
      now,
    });

    expect(result.fileNote).toMatchObject({
      id: "file",
      userNote: "Keep this file note.",
      createdBy: "user",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: now,
      aiExplanation: { summary: "Adds two numbers." },
    });
    expect(result.sectionNotes[0]).toMatchObject({
      id: "section:existing",
      userNote: "Keep this section note.",
      aiExplanation: { summary: "Returns the sum." },
    });
    expect(result.sectionNotes).toContainEqual(existing.sectionNotes[1]);
    expect(result.lineNotes).toEqual(existing.lineNotes);
  });
});

function createAiResponse(): Record<string, unknown> {
  return {
    file: {
      summary: "Adds two numbers.",
      detail: "Exports a function that returns the sum of two numeric arguments.",
    },
    sections: [
      {
        title: "Add function",
        kind: "function",
        range: { startLine: 1, endLine: 3 },
        summary: "Returns the sum.",
        detail: "The function adds both parameters and returns the result.",
      },
    ],
  };
}

function createExistingSourceFile(): StoredSourceFile {
  const createdAt = "2026-01-01T00:00:00.000Z";

  return {
    source: {
      sourceHash: "sha256:old",
      programmingLanguage: "typescript",
    },
    fileNote: {
      id: "file",
      userNote: "Keep this file note.",
      aiExplanation: { summary: "Old file summary.", detail: "Old file detail." },
      status: { content: "stale", anchor: "confirmed" },
      createdBy: "user",
      createdAt,
      updatedAt: createdAt,
    },
    sectionNotes: [
      {
        id: "section:existing",
        title: "Old generated section",
        range: { startLine: 1, endLine: 3 },
        anchorHash: "sha256:old-section",
        userNote: "Keep this section note.",
        aiExplanation: { summary: "Old section summary.", detail: "Old section detail." },
        status: { content: "stale", anchor: "confirmed" },
        createdBy: "ai",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "section:user-only",
        title: "Manual section",
        range: { startLine: 2, endLine: 2 },
        anchorHash: "sha256:manual",
        userNote: "Do not remove this unmatched section.",
        status: { content: "current", anchor: "confirmed" },
        createdBy: "user",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    lineNotes: [
      {
        id: "line:2",
        line: 2,
        anchorText: "  return a + b;",
        userNote: "Keep this line note.",
        status: { content: "current", anchor: "confirmed" },
        createdBy: "user",
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };
}
