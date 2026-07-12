/**
 * Unit tests for combined file and section AI analysis normalization.
 */

import { describe, expect, it } from "vitest";
import type { AiClient } from "@shared/ai/aiClient";
import { explainFileSectionService } from "@shared/services/explainFileSectionService";

describe("explainFileSectionService()", () => {
  it("passes the prompt to the AI client and normalizes valid file and section analysis", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        file: {
          summary: "Defines a button component.",
          detail: "The file exports a React component that renders a Save button.",
          aiNotes: ["The file contains JSX.", 1, null],
        },
        sections: [
          {
            title: "Button rendering",
            kind: "component-rendering",
            range: {
              startLine: 1,
              endLine: 3,
            },
            summary: "Renders the Save button.",
            detail: "This section returns the JSX button output.",
            aiNotes: ["The section range is inclusive.", false],
          },
        ],
      },
      prompts,
    );

    const result = await explainFileSectionService("Analyze file and sections as JSON.", aiClient, {
      lineCount: 3,
    });

    expect(prompts).toEqual(["Analyze file and sections as JSON."]);
    expect(result).toEqual({
      file: {
        summary: "Defines a button component.",
        detail: "The file exports a React component that renders a Save button.",
        aiNotes: ["The file contains JSX."],
      },
      sections: [
        {
          title: "Button rendering",
          kind: "component-rendering",
          range: {
            startLine: 1,
            endLine: 3,
          },
          summary: "Renders the Save button.",
          detail: "This section returns the JSX button output.",
          aiNotes: ["The section range is inclusive."],
        },
      ],
    });
  });

  it("parses fenced JSON and omits empty optional fields", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        file: {
          summary: "Reads settings.",
          detail: "The file reads and validates settings.",
          aiNotes: [],
        },
        sections: [
          {
            title: "Settings read",
            kind: "",
            range: {
              startLine: "1",
              endLine: "4",
            },
            summary: "Reads extension settings.",
            detail: "This section reads configuration values.",
            aiNotes: [],
          },
        ],
      },
      prompts,
    );

    const result = await explainFileSectionService("Analyze settings.", aiClient);

    expect(result).toEqual({
      file: {
        summary: "Reads settings.",
        detail: "The file reads and validates settings.",
      },
      sections: [
        {
          title: "Settings read",
          range: {
            startLine: 1,
            endLine: 4,
          },
          summary: "Reads extension settings.",
          detail: "This section reads configuration values.",
        },
      ],
    });
  });

  it("throws when file required fields are missing", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        file: {
          summary: "Only summary is present.",
        },
        sections: [],
      },
      prompts,
    );

    await expect(explainFileSectionService("Analyze invalid file.", aiClient)).rejects.toThrow(
      "Invalid file section analysis response: file.summary and file.detail are required.",
    );
  });

  it("throws when sections is not an array", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        file: {
          summary: "Valid file.",
          detail: "Valid file detail.",
        },
        sections: {},
      },
      prompts,
    );

    await expect(explainFileSectionService("Analyze invalid sections.", aiClient)).rejects.toThrow(
      "Invalid file section analysis response: sections must be an array.",
    );
  });

  it("throws when a section is outside the provided source line count", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        file: {
          summary: "Valid file.",
          detail: "Valid file detail.",
        },
        sections: [
          {
            title: "Out of range",
            range: {
              startLine: 1,
              endLine: 99,
            },
            summary: "Invalid range.",
            detail: "The range exceeds the source file.",
          },
        ],
      },
      prompts,
    );

    await expect(
      explainFileSectionService("Analyze out-of-range section.", aiClient, {
        lineCount: 3,
      }),
    ).rejects.toThrow(
      "Invalid file section analysis response: section 0 requires title, range, summary, and detail.",
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
 * const client = createFakeAiClient({ file: {}, sections: [] }, prompts);
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
