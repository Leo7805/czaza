/**
 * Unit tests for coordinated file, section, and line AI analysis.
 */

import { describe, expect, it, vi } from "vitest";
import type { AiClient } from "@shared/ai/aiClient";
import { explainFileSectionLineService } from "@shared/services/explainFileSectionLineService";

describe("explainFileSectionLineService()", () => {
  it("calls AI once and normalizes all three levels", async () => {
    const aiClient = createFakeAiClient({
      file: {
        summary: "Runs a save operation.",
        detail: "The file exports a function that delegates to the save API.",
        aiNotes: ["The save API is external.", 1],
      },
      sections: [
        {
          title: "Return flow",
          kind: "function-body",
          range: { startLine: 3, endLine: 4 },
          summary: "Returns the save result.",
          detail: "The section invokes save and returns its result.",
          aiNotes: [],
        },
        {
          title: "Function declaration",
          kind: "function",
          range: { startLine: 1, endLine: 4 },
          summary: "Declares the run function.",
          detail: "The section defines the exported entry point.",
          aiNotes: [],
        },
      ],
      lines: [
        {
          lineNumber: 3,
          summary: "Returns the save result.",
          detail: "The line returns the value produced by save.",
          aiNotes: [],
        },
        {
          lineNumber: 1,
          summary: "Declares the run function.",
          detail: "The line exports the function used as the file entry point.",
          aiNotes: [],
        },
      ],
    });

    const result = await explainFileSectionLineService("Analyze all levels.", aiClient, {
      lineCount: 4,
      requestedLineNumbers: [1, 3],
    });

    expect(aiClient.complete).toHaveBeenCalledOnce();
    expect(aiClient.complete).toHaveBeenCalledWith("Analyze all levels.");
    expect(result.file).toEqual({
      summary: "Runs a save operation.",
      detail: "The file exports a function that delegates to the save API.",
      aiNotes: ["The save API is external."],
    });
    expect(result.sections.map((section) => section.title)).toEqual([
      "Function declaration",
      "Return flow",
    ]);
    expect(result.lines.map((line) => line.lineNumber)).toEqual([1, 3]);
  });

  it("accepts fenced JSON and an empty requested line set", async () => {
    const aiClient = createFakeAiClient(
      {
        file: { summary: "Documents a file.", detail: "The file contains comments only." },
        sections: [],
        lines: [],
      },
      true,
    );

    const result = await explainFileSectionLineService("Analyze comments.", aiClient, {
      lineCount: 1,
      requestedLineNumbers: [],
    });

    expect(result.lines).toEqual([]);
  });

  it("rejects an out-of-range section", async () => {
    const aiClient = createFakeAiClient({
      file: { summary: "Explains a file.", detail: "The file contains one section." },
      sections: [
        {
          title: "Outside",
          range: { startLine: 1, endLine: 8 },
          summary: "Exceeds the source.",
          detail: "The returned section extends beyond the file.",
        },
      ],
      lines: [],
    });

    await expect(
      explainFileSectionLineService("Analyze invalid sections.", aiClient, {
        lineCount: 4,
        requestedLineNumbers: [],
      }),
    ).rejects.toThrow(
      "Invalid file section line analysis response: section 0 requires title, range, summary, and detail.",
    );
  });

  it("rejects missing and duplicate returned line numbers", async () => {
    const missingClient = createFakeAiClient({
      file: { summary: "Explains a file.", detail: "The file has requested lines." },
      sections: [],
      lines: [
        {
          lineNumber: 1,
          summary: "Explains line one.",
          detail: "The first line starts the file.",
        },
      ],
    });

    await expect(
      explainFileSectionLineService("Analyze missing lines.", missingClient, {
        lineCount: 3,
        requestedLineNumbers: [1, 3],
      }),
    ).rejects.toThrow("expected exactly one result for requested lineNumbers 1, 3");

    const duplicateClient = createFakeAiClient({
      file: { summary: "Explains a file.", detail: "The file has duplicate results." },
      sections: [],
      lines: [
        {
          lineNumber: 1,
          summary: "First result.",
          detail: "The first result explains line one.",
        },
        {
          lineNumber: 1,
          summary: "Duplicate result.",
          detail: "The second result also explains line one.",
        },
      ],
    });

    await expect(
      explainFileSectionLineService("Analyze duplicate lines.", duplicateClient, {
        lineCount: 3,
        requestedLineNumbers: [1],
      }),
    ).rejects.toThrow("duplicate lineNumber 1");
  });

  it("rejects invalid context before calling AI", async () => {
    const aiClient = createFakeAiClient({});

    await expect(
      explainFileSectionLineService("Do not send.", aiClient, {
        lineCount: 3,
        requestedLineNumbers: [4],
      }),
    ).rejects.toThrow("requested lineNumber 4 is outside the source range");
    expect(aiClient.complete).not.toHaveBeenCalled();

    await expect(
      explainFileSectionLineService("Do not send.", aiClient, {
        lineCount: 3,
        requestedLineNumbers: [2, 2],
      }),
    ).rejects.toThrow("duplicate requested lineNumber 2");
    expect(aiClient.complete).not.toHaveBeenCalled();
  });
});

/** Creates a Fake AI client returning plain or fenced JSON. */
function createFakeAiClient(response: unknown, fenced = false): AiClient & { complete: ReturnType<typeof vi.fn> } {
  const content = JSON.stringify(response);

  return {
    complete: vi.fn().mockResolvedValue(fenced ? `\`\`\`json\n${content}\n\`\`\`` : content),
  };
}
