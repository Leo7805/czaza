/**
 * Estimates and validates one-file All Notes AI requests before execution.
 */

import { SYSTEM_PROMPT } from "@shared/prompts/systemPrompt";
import { AI_REQUEST_DEFAULTS } from "@shared/config/aiRequestDefaults";

/**
 * Stable reasons why an All Notes request cannot run safely.
 */
export type AllNotesRequestLimitReason =
  | "too-many-lines"
  | "input-too-large"
  | "output-too-large"
  | "context-too-large";

/**
 * Application-level safety limits for one All Notes AI request.
 */
export type AllNotesRequestLimits = {
  /** Maximum number of source lines that may receive AI line notes. */
  maxCandidateLines: number;

  /** Maximum estimated input size allowed by CZaza. */
  maxEstimatedInputTokens: number;

  /** Maximum output token cap CZaza may send to the provider. */
  maxRequestOutputTokens: number;

  /** Estimated output reserved for file and section notes. */
  baseOutputTokens: number;

  /** Conservative estimated output for one line note. */
  tokensPerLineNote: number;

  /** Safety multiplier applied to the estimated structured output. */
  outputSafetyMultiplier: number;
};

/**
 * Default CZaza limits for one-file All Notes generation.
 */
export const DEFAULT_ALL_NOTES_REQUEST_LIMITS: Readonly<AllNotesRequestLimits> =
  AI_REQUEST_DEFAULTS.allNotes;

/**
 * Input required to assess an All Notes request.
 */
export type AssessAllNotesRequestInput = {
  /** Complete user prompt that will contain the numbered source file. */
  prompt: string;

  /** System prompt sent alongside the user prompt. */
  systemPrompt?: string;

  /** Physical source line count shown in user-facing diagnostics. */
  sourceLineCount: number;

  /** Filtered line count that must produce individual line notes. */
  candidateLineCount: number;

  /** Context-window limit published for the selected model. */
  modelContextWindowTokens: number;

  /** Maximum output published for the selected model. */
  modelMaxOutputTokens: number;

  /** Optional overrides used by tests or future provider-specific policies. */
  limits?: Partial<AllNotesRequestLimits>;
};

/**
 * Result of an All Notes request safety assessment.
 */
export type AllNotesRequestAssessment = {
  /** Whether the request is allowed to reach the AI provider. */
  allowed: boolean;

  /** Physical source line count supplied by the caller. */
  sourceLineCount: number;

  /** Number of filtered lines that require line notes. */
  candidateLineCount: number;

  /** Conservative estimate for system and user prompt tokens. */
  estimatedInputTokens: number;

  /** Conservative estimate for complete structured output tokens. */
  estimatedOutputTokens: number;

  /** Output cap to pass as the provider's max_tokens value. */
  recommendedMaxTokens: number;

  /** Stable rejection reason when the request is not allowed. */
  reason?: AllNotesRequestLimitReason;
};

/**
 * Assesses whether one All Notes request fits CZaza and model safety limits.
 *
 * The estimate deliberately favors safety over tokenizer-level precision. ASCII
 * text is estimated at four characters per token and non-ASCII text at one
 * code point per token.
 *
 * @param input - Prompt size, source statistics, model limits, and optional policy overrides.
 * @returns Request assessment and the recommended provider output cap.
 *
 * @example
 * const assessment = assessAllNotesRequest({
 *   prompt: "Analyze this numbered source file.",
 *   sourceLineCount: 120,
 *   candidateLineCount: 80,
 *   modelContextWindowTokens: 1_000_000,
 *   modelMaxOutputTokens: 384_000,
 * });
 */
export function assessAllNotesRequest(
  input: AssessAllNotesRequestInput,
): AllNotesRequestAssessment {
  assertNonNegativeInteger(input.sourceLineCount, "sourceLineCount");
  assertNonNegativeInteger(input.candidateLineCount, "candidateLineCount");
  assertPositiveInteger(input.modelContextWindowTokens, "modelContextWindowTokens");
  assertPositiveInteger(input.modelMaxOutputTokens, "modelMaxOutputTokens");

  const limits = resolveLimits(input.limits);
  const estimatedInputTokens = estimateTextTokens(
    `${input.systemPrompt ?? SYSTEM_PROMPT}\n${input.prompt}`,
  );
  const estimatedOutputTokens = Math.ceil(
    (limits.baseOutputTokens + input.candidateLineCount * limits.tokensPerLineNote) *
      limits.outputSafetyMultiplier,
  );
  const providerOutputLimit = Math.min(
    limits.maxRequestOutputTokens,
    input.modelMaxOutputTokens,
  );
  const recommendedMaxTokens = Math.min(estimatedOutputTokens, providerOutputLimit);
  const baseAssessment = {
    sourceLineCount: input.sourceLineCount,
    candidateLineCount: input.candidateLineCount,
    estimatedInputTokens,
    estimatedOutputTokens,
    recommendedMaxTokens,
  };

  if (input.candidateLineCount > limits.maxCandidateLines) {
    return { ...baseAssessment, allowed: false, reason: "too-many-lines" };
  }

  if (estimatedInputTokens > limits.maxEstimatedInputTokens) {
    return { ...baseAssessment, allowed: false, reason: "input-too-large" };
  }

  if (estimatedOutputTokens > providerOutputLimit) {
    return { ...baseAssessment, allowed: false, reason: "output-too-large" };
  }

  if (estimatedInputTokens + recommendedMaxTokens > input.modelContextWindowTokens) {
    return { ...baseAssessment, allowed: false, reason: "context-too-large" };
  }

  return { ...baseAssessment, allowed: true };
}

/** Resolves and validates optional policy overrides. */
function resolveLimits(overrides?: Partial<AllNotesRequestLimits>): AllNotesRequestLimits {
  const limits = { ...DEFAULT_ALL_NOTES_REQUEST_LIMITS, ...overrides };

  assertNonNegativeInteger(limits.maxCandidateLines, "maxCandidateLines");
  assertPositiveInteger(limits.maxEstimatedInputTokens, "maxEstimatedInputTokens");
  assertPositiveInteger(limits.maxRequestOutputTokens, "maxRequestOutputTokens");
  assertNonNegativeInteger(limits.baseOutputTokens, "baseOutputTokens");
  assertPositiveInteger(limits.tokensPerLineNote, "tokensPerLineNote");

  if (!Number.isFinite(limits.outputSafetyMultiplier) || limits.outputSafetyMultiplier < 1) {
    throw new RangeError("outputSafetyMultiplier must be a finite number greater than or equal to 1.");
  }

  return limits;
}

/** Estimates mixed ASCII and non-ASCII text without adding a tokenizer dependency. */
function estimateTextTokens(text: string): number {
  let asciiCharacters = 0;
  let nonAsciiCharacters = 0;

  for (const character of text) {
    if (character.codePointAt(0)! <= 0x7f) {
      asciiCharacters += 1;
    } else {
      nonAsciiCharacters += 1;
    }
  }

  return Math.ceil(asciiCharacters / 4 + nonAsciiCharacters);
}

/** Validates a non-negative integer policy or request value. */
function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer.`);
  }
}

/** Validates a positive integer model or policy value. */
function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}
