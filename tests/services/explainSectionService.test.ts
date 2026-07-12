/**
 * Unit tests for section-level AI analysis normalization.
 */

import { describe, expect, it } from "vitest";
import type { AiClient } from "@shared/ai/aiClient";
import { explainSectionService } from "@shared/services/explainSectionService";

describe("explainSectionService()", () => {
  it("passes the prompt to the AI client and normalizes valid sections", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        sections: [
          {
            title: "Render button",
            kind: "component-rendering",
            range: {
              startLine: 3,
              endLine: 5,
            },
            summary: "Renders the Save button.",
            detail: "This section returns the JSX button and connects visible text to the component output.",
            aiNotes: ["The section range is inclusive.", 1, null],
          },
        ],
      },
      prompts,
    );

    const result = await explainSectionService("Analyze sections as JSON.", aiClient);

    expect(prompts).toEqual(["Analyze sections as JSON."]);
    expect(result).toEqual([
      {
        title: "Render button",
        kind: "component-rendering",
        range: {
          startLine: 3,
          endLine: 5,
        },
        summary: "Renders the Save button.",
        detail: "This section returns the JSX button and connects visible text to the component output.",
        aiNotes: ["The section range is inclusive."],
      },
    ]);
  });

  it("parses fenced JSON responses and omits empty optional fields", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        sections: [
          {
            title: "Read settings",
            kind: "",
            range: {
              startLine: "1",
              endLine: "4",
            },
            summary: "Reads extension settings.",
            detail: "This section reads settings and prepares validated runtime values.",
            aiNotes: [],
          },
        ],
      },
      prompts,
    );

    const result = await explainSectionService("Analyze settings sections.", aiClient);

    expect(result).toEqual([
      {
        title: "Read settings",
        range: {
          startLine: 1,
          endLine: 4,
        },
        summary: "Reads extension settings.",
        detail: "This section reads settings and prepares validated runtime values.",
      },
    ]);
  });

  it("throws when sections is not an array", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient({ sections: {} }, prompts);

    await expect(explainSectionService("Analyze invalid response.", aiClient)).rejects.toThrow(
      "Invalid section analysis response: sections must be an array.",
    );
  });

  it("throws when a section is missing required fields", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        sections: [
          {
            title: "Only title",
            range: {
              startLine: 1,
              endLine: 2,
            },
          },
        ],
      },
      prompts,
    );

    await expect(explainSectionService("Analyze incomplete section.", aiClient)).rejects.toThrow(
      "Invalid section analysis response: section 0 requires title, range, summary, and detail.",
    );
  });

  it("allows high positive line numbers when source line count is not provided", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        sections: [
          {
            title: "High range",
            range: {
              startLine: 2,
              endLine: 99,
            },
            summary: "Uses a high but positive range.",
            detail: "This section can pass DTO validation when no source line count is available.",
          },
        ],
      },
      prompts,
    );

    const result = await explainSectionService("Analyze high range section.", aiClient);

    expect(result[0]?.range).toEqual({
      startLine: 2,
      endLine: 99,
    });
  });

  it("throws when a section range is outside the provided source line count", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        sections: [
          {
            title: "Out of range",
            range: {
              startLine: 2,
              endLine: 99,
            },
            summary: "Uses an invalid range.",
            detail: "This section should fail validation because the range exceeds the file.",
          },
        ],
      },
      prompts,
    );

    await expect(
      explainSectionService("Analyze out-of-range section.", aiClient, {
        lineCount: 5,
      }),
    ).rejects.toThrow(
      "Invalid section analysis response: section 0 requires title, range, summary, and detail.",
    );
  });

  it("throws when a section range is reversed", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        sections: [
          {
            title: "Reversed range",
            range: {
              startLine: 4,
              endLine: 2,
            },
            summary: "Uses a reversed range.",
            detail: "This section should fail validation because startLine is greater than endLine.",
          },
        ],
      },
      prompts,
    );

    await expect(explainSectionService("Analyze reversed section.", aiClient)).rejects.toThrow(
      "Invalid section analysis response: section 0 requires title, range, summary, and detail.",
    );
  });
});

/**
 * Creates a fake AI client that captures prompts and returns fenced JSON.
 *
 * @param response - JSON-serializable response returned by the fake client.
 * @param prompts - Mutable prompt capture array.
 * @returns AiClient test double.
 *
 * @example
 * const prompts: string[] = [];
 * const client = createFakeAiClient({ sections: [] }, prompts);
 */
function createFakeAiClient(response: unknown, prompts: string[]): AiClient {
  return {
    complete: async (prompt) => {
      prompts.push(prompt);

      return `\`\`\`json
${JSON.stringify(response)}
\`\`\``;
    },
  };
}
