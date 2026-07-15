/**
 * Unit tests for batch line AI analysis normalization.
 */

import { describe, expect, it } from "vitest";
import type { AiClient } from "@shared/ai/aiClient";
import { explainLineBatchService } from "@shared/services/explainLineBatchService";

describe("explainLineBatchService()", () => {
  it("passes the prompt to the AI client and normalizes valid line entries", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        lines: [
          {
            lineNumber: 3,
            summary: "Returns the Save button.",
            detail: "The line returns JSX that renders a button with the Save label.",
            aiNotes: ["The returned JSX is the component output.", 1, null],
          },
          {
            lineNumber: 2,
            summary: "Defines the button label.",
            detail: "The line stores the Save label in a local constant.",
            aiNotes: [],
          },
        ],
      },
      prompts,
    );

    const result = await explainLineBatchService("Analyze these lines as JSON.", aiClient, {
      requestedLineNumbers: [2, 3],
    });

    expect(prompts).toEqual(["Analyze these lines as JSON."]);
    expect(result).toEqual([
      {
        lineNumber: 2,
        summary: "Defines the button label.",
        detail: "The line stores the Save label in a local constant.",
      },
      {
        lineNumber: 3,
        summary: "Returns the Save button.",
        detail: "The line returns JSX that renders a button with the Save label.",
        aiNotes: ["The returned JSX is the component output."],
      },
    ]);
  });

  it("parses fenced JSON and allows positive line numbers without request context", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        lines: [
          {
            lineNumber: "99",
            summary: "Explains a high line number.",
            detail: "The line number is accepted when no requested line set is provided.",
            aiNotes: [],
          },
        ],
      },
      prompts,
    );

    const result = await explainLineBatchService("Analyze high line.", aiClient);

    expect(result).toEqual([
      {
        lineNumber: 99,
        summary: "Explains a high line number.",
        detail: "The line number is accepted when no requested line set is provided.",
      },
    ]);
  });

  it("throws when lines is not an array", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient({ lines: {} }, prompts);

    await expect(explainLineBatchService("Analyze invalid response.", aiClient)).rejects.toThrow(
      "Invalid line batch analysis response: lines must be an array.",
    );
  });

  it("throws when a line item is missing required fields", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        lines: [
          {
            lineNumber: 2,
            summary: "Only summary is present.",
          },
        ],
      },
      prompts,
    );

    await expect(explainLineBatchService("Analyze incomplete line.", aiClient)).rejects.toThrow(
      "Invalid line batch analysis response: line 0 requires lineNumber, summary, and detail.",
    );
  });

  it("throws when a returned line number is not requested", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        lines: [
          {
            lineNumber: 99,
            summary: "Unexpected line.",
            detail: "This line was not part of the requested line set.",
          },
        ],
      },
      prompts,
    );

    await expect(
      explainLineBatchService("Analyze unexpected line.", aiClient, {
        requestedLineNumbers: [2, 3],
      }),
    ).rejects.toThrow(
      "Invalid line batch analysis response: line 0 requires lineNumber, summary, and detail.",
    );
  });

  it("throws when a returned line number is not positive", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        lines: [
          {
            lineNumber: 0,
            summary: "Invalid line.",
            detail: "Line numbers must be one-based positive integers.",
          },
        ],
      },
      prompts,
    );

    await expect(explainLineBatchService("Analyze zero line.", aiClient)).rejects.toThrow(
      "Invalid line batch analysis response: line 0 requires lineNumber, summary, and detail.",
    );
  });

  it("throws when a requested line result is missing", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        lines: [
          {
            lineNumber: 2,
            summary: "Explains line two.",
            detail: "Only one of the requested lines was returned.",
          },
        ],
      },
      prompts,
    );

    await expect(
      explainLineBatchService("Analyze incomplete batch.", aiClient, {
        requestedLineNumbers: [2, 3],
      }),
    ).rejects.toThrow(
      "Invalid line batch analysis response: expected exactly one result for requested lineNumbers 2, 3.",
    );
  });

  it("throws when a line number is returned more than once", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        lines: [
          {
            lineNumber: 2,
            summary: "First result.",
            detail: "The first explanation for line two.",
          },
          {
            lineNumber: 2,
            summary: "Second result.",
            detail: "The duplicate explanation for line two.",
          },
        ],
      },
      prompts,
    );

    await expect(
      explainLineBatchService("Analyze duplicate batch.", aiClient, {
        requestedLineNumbers: [2],
      }),
    ).rejects.toThrow("Invalid line batch analysis response: duplicate lineNumber 2.");
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
 * const client = createFakeAiClient({ lines: [] }, prompts);
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
