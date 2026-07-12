/**
 * Unit tests for file-level AI analysis normalization.
 */

import { describe, expect, it } from "vitest";
import type { AiClient } from "@shared/ai/aiClient";
import { explainFileService } from "@shared/services/explainFileService";

describe("explainFileService()", () => {
  it("passes the prompt to the AI client and normalizes a valid file analysis", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        summary: "Explains a button component.",
        detail: "The file exports a button component and centralizes its styling.",
        aiNotes: ["className controls the visible styling.", 1, null],
      },
      prompts,
    );

    const result = await explainFileService("Analyze this file as JSON.", aiClient);

    expect(prompts).toEqual(["Analyze this file as JSON."]);
    expect(result).toEqual({
      summary: "Explains a button component.",
      detail: "The file exports a button component and centralizes its styling.",
      aiNotes: ["className controls the visible styling."],
    });
  });

  it("parses fenced JSON responses", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        summary: "Reads settings.",
        detail: "The file reads and validates extension settings.",
        aiNotes: [],
      },
      prompts,
    );

    const result = await explainFileService("Analyze settings.", aiClient);

    expect(result).toEqual({
      summary: "Reads settings.",
      detail: "The file reads and validates extension settings.",
    });
  });

  it("throws when required fields are missing", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        summary: "Only summary is present.",
        aiNotes: [],
      },
      prompts,
    );

    await expect(explainFileService("Analyze invalid output.", aiClient)).rejects.toThrow(
      "Invalid file analysis response: summary and detail are required.",
    );
  });

  it("throws when required fields are empty strings", async () => {
    const prompts: string[] = [];
    const aiClient = createFakeAiClient(
      {
        summary: "   ",
        detail: "   ",
        aiNotes: [],
      },
      prompts,
    );

    await expect(explainFileService("Analyze blank output.", aiClient)).rejects.toThrow(
      "Invalid file analysis response: summary and detail are required.",
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
