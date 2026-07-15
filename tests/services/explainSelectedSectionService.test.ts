/**
 * Unit tests for selected-section AI response normalization.
 */

import { describe, expect, it } from "vitest";

import type { AiClient } from "@shared/ai/aiClient";
import { explainSelectedSectionService } from "@shared/services/explainSelectedSectionService";

describe("explainSelectedSectionService()", () => {
  it("normalizes exactly one returned section", async () => {
    const result = await explainSelectedSectionService(
      "Analyze one selected section.",
      createFakeAiClient({
        sections: [
          {
            title: "Run function",
            kind: "function",
            range: { startLine: 1, endLine: 3 },
            summary: "Runs the operation.",
            detail: "This section contains the function body and its return behavior.",
            aiNotes: ["The range is inclusive."],
          },
        ],
      }),
      { lineCount: 3 },
    );

    expect(result).toEqual({
      title: "Run function",
      kind: "function",
      range: { startLine: 1, endLine: 3 },
      summary: "Runs the operation.",
      detail: "This section contains the function body and its return behavior.",
      aiNotes: ["The range is inclusive."],
    });
  });

  it("rejects responses containing more than one section", async () => {
    await expect(
      explainSelectedSectionService(
        "Analyze one selected section.",
        createFakeAiClient({
          sections: [
            {
              title: "First",
              range: { startLine: 1, endLine: 1 },
              summary: "First.",
              detail: "First detail.",
            },
            {
              title: "Second",
              range: { startLine: 2, endLine: 2 },
              summary: "Second.",
              detail: "Second detail.",
            },
          ],
        }),
        { lineCount: 2 },
      ),
    ).rejects.toThrow("exactly one section is required");
  });
});

function createFakeAiClient(response: unknown): AiClient {
  return {
    complete: async () => JSON.stringify(response),
  };
}
