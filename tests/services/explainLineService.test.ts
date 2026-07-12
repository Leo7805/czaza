/**
 * Unit tests for single-line AI analysis normalization.
 */

import { describe, expect, it } from "vitest";
import type { AiClient } from "@shared/ai/aiClient";
import { explainLineService } from "@shared/services/explainLineService";

describe("explainLineService()", () => {
  it("passes the prompt to the AI client and normalizes a valid line analysis", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        summary: "Returns the Save button.",
        detail: "The line returns JSX that renders a button with the Save label.",
        aiNotes: ["The returned JSX is the component output.", 1, null],
      },
      prompts,
    );

    const result = await explainLineService("Analyze this line as JSON.", aiClient);

    expect(prompts).toEqual(["Analyze this line as JSON."]);
    expect(result).toEqual({
      summary: "Returns the Save button.",
      detail: "The line returns JSX that renders a button with the Save label.",
      aiNotes: ["The returned JSX is the component output."],
    });
  });

  it("parses fenced JSON responses and omits empty optional fields", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        summary: "Reads the configured model.",
        detail: "The line reads the model setting from the validated configuration object.",
        aiNotes: [],
      },
      prompts,
    );

    const result = await explainLineService("Analyze model line.", aiClient);

    expect(result).toEqual({
      summary: "Reads the configured model.",
      detail: "The line reads the model setting from the validated configuration object.",
    });
  });

  it("throws when required fields are missing", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        summary: "Only summary is present.",
      },
      prompts,
    );

    await expect(explainLineService("Analyze invalid output.", aiClient)).rejects.toThrow(
      "Invalid line analysis response: summary and detail are required.",
    );
  });

  it("throws when required fields are empty strings", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        summary: "   ",
        detail: "   ",
      },
      prompts,
    );

    await expect(explainLineService("Analyze blank output.", aiClient)).rejects.toThrow(
      "Invalid line analysis response: summary and detail are required.",
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
 * const client = createFakeAiClient({ summary: "...", detail: "..." }, prompts);
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
