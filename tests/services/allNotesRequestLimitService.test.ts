/**
 * Unit tests for All Notes request safety assessment.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALL_NOTES_REQUEST_LIMITS,
  assessAllNotesRequest,
} from "@shared/services/allNotesRequestLimitService";

const MODEL_CONTEXT_TOKENS = 1_000_000;
const MODEL_OUTPUT_TOKENS = 384_000;

describe("assessAllNotesRequest()", () => {
  it("uses the 192k CZaza per-request output ceiling", () => {
    expect(DEFAULT_ALL_NOTES_REQUEST_LIMITS.maxRequestOutputTokens).toBe(192_000);
  });

  it("allows a request at the 300 candidate-line boundary", () => {
    const result = assessAllNotesRequest({
      prompt: "Analyze this source file.",
      sourceLineCount: 420,
      candidateLineCount: 300,
      modelContextWindowTokens: MODEL_CONTEXT_TOKENS,
      modelMaxOutputTokens: MODEL_OUTPUT_TOKENS,
    });

    expect(result).toMatchObject({
      allowed: true,
      sourceLineCount: 420,
      candidateLineCount: 300,
      estimatedOutputTokens: 63_600,
      recommendedMaxTokens: 63_600,
    });
  });

  it("rejects more than 300 candidate lines", () => {
    const result = assessAllNotesRequest({
      prompt: "Analyze this source file.",
      sourceLineCount: 500,
      candidateLineCount: 301,
      modelContextWindowTokens: MODEL_CONTEXT_TOKENS,
      modelMaxOutputTokens: MODEL_OUTPUT_TOKENS,
    });

    expect(result).toMatchObject({ allowed: false, reason: "too-many-lines" });
  });

  it("rejects an estimated input beyond the CZaza input limit", () => {
    const result = assessAllNotesRequest({
      prompt: "a".repeat(400_100),
      sourceLineCount: 1,
      candidateLineCount: 1,
      modelContextWindowTokens: MODEL_CONTEXT_TOKENS,
      modelMaxOutputTokens: MODEL_OUTPUT_TOKENS,
    });

    expect(result).toMatchObject({ allowed: false, reason: "input-too-large" });
    expect(result.estimatedInputTokens).toBeGreaterThan(
      DEFAULT_ALL_NOTES_REQUEST_LIMITS.maxEstimatedInputTokens,
    );
  });

  it("rejects output beyond the selected model output limit", () => {
    const result = assessAllNotesRequest({
      prompt: "Analyze this source file.",
      sourceLineCount: 10,
      candidateLineCount: 10,
      modelContextWindowTokens: MODEL_CONTEXT_TOKENS,
      modelMaxOutputTokens: 10_000,
      limits: { maxRequestOutputTokens: 64_000 },
    });

    expect(result).toMatchObject({
      allowed: false,
      reason: "output-too-large",
      recommendedMaxTokens: 10_000,
    });
  });

  it("rejects input plus output beyond the model context window", () => {
    const result = assessAllNotesRequest({
      prompt: "a".repeat(200),
      sourceLineCount: 10,
      candidateLineCount: 10,
      modelContextWindowTokens: 11_000,
      modelMaxOutputTokens: MODEL_OUTPUT_TOKENS,
      limits: { maxEstimatedInputTokens: 100_000 },
    });

    expect(result).toMatchObject({ allowed: false, reason: "context-too-large" });
  });

  it("counts non-ASCII prompt text conservatively", () => {
    const ascii = assessAllNotesRequest({
      prompt: "a".repeat(40),
      sourceLineCount: 1,
      candidateLineCount: 1,
      modelContextWindowTokens: MODEL_CONTEXT_TOKENS,
      modelMaxOutputTokens: MODEL_OUTPUT_TOKENS,
    });
    const nonAscii = assessAllNotesRequest({
      prompt: "界".repeat(40),
      sourceLineCount: 1,
      candidateLineCount: 1,
      modelContextWindowTokens: MODEL_CONTEXT_TOKENS,
      modelMaxOutputTokens: MODEL_OUTPUT_TOKENS,
    });

    expect(nonAscii.estimatedInputTokens).toBeGreaterThan(ascii.estimatedInputTokens);
  });
});
