/** Executes AI requests that must return validated structured JSON. */

import type { AiClient } from "@shared/ai/aiClient";

export type StructuredAiResponseErrorKind =
  | "empty-response"
  | "invalid-json"
  | "invalid-structured-response";

export class StructuredAiResponseError extends Error {
  readonly kind: StructuredAiResponseErrorKind;
  readonly responseName: string;
  readonly issues: readonly string[];
  readonly attempts: number;

  constructor(input: {
    kind: StructuredAiResponseErrorKind;
    responseName: string;
    issues: readonly string[];
    attempts: number;
    cause?: unknown;
  }) {
    const issueText = input.issues.length > 0 ? ` ${input.issues.join(" ")}` : "";
    super(
      `Invalid ${input.responseName} response after ${input.attempts} attempts.${issueText}`,
      input.cause === undefined ? undefined : { cause: input.cause },
    );
    this.name = "StructuredAiResponseError";
    this.kind = input.kind;
    this.responseName = input.responseName;
    this.issues = input.issues;
    this.attempts = input.attempts;
  }
}

export type StructuredAiRequest<T> = {
  prompt: string;
  aiClient: AiClient;
  responseName: string;
  parseAndValidate(responseText: string): T;
  maxAttempts?: number;
};

const DEFAULT_MAX_ATTEMPTS = 2;

/** Completes, validates, and performs one bounded correction retry by default. */
export async function completeStructuredAiResponse<T>(
  request: StructuredAiRequest<T>,
): Promise<T> {
  const maxAttempts = request.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("Structured AI maxAttempts must be a positive integer.");
  }

  let prompt = request.prompt;
  let lastFailure: RecoverableFailure | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const responseText = await request.aiClient.complete(prompt);

      if (responseText.trim().length === 0) {
        throw new Error("AI returned an empty response.");
      }

      return request.parseAndValidate(responseText);
    } catch (error) {
      const failure = classifyRecoverableFailure(error);

      if (!failure) {
        throw error;
      }

      lastFailure = failure;

      if (attempt < maxAttempts) {
        prompt = buildCorrectionPrompt(request.prompt, request.responseName, failure.issues);
      }
    }
  }

  throw new StructuredAiResponseError({
    kind: lastFailure?.kind ?? "invalid-structured-response",
    responseName: request.responseName,
    issues: lastFailure?.issues ?? [],
    attempts: maxAttempts,
    cause: lastFailure?.cause,
  });
}

type RecoverableFailure = {
  kind: StructuredAiResponseErrorKind;
  issues: string[];
  cause: unknown;
};

function classifyRecoverableFailure(error: unknown): RecoverableFailure | undefined {
  if (error instanceof SyntaxError) {
    return { kind: "invalid-json", issues: [sanitizeIssue(error.message)], cause: error };
  }

  if (!(error instanceof Error)) {
    return undefined;
  }

  if (/empty (?:JSON )?response/i.test(error.message)) {
    return { kind: "empty-response", issues: [sanitizeIssue(error.message)], cause: error };
  }

  if (/^Invalid .* response:/.test(error.message)) {
    return {
      kind: "invalid-structured-response",
      issues: [sanitizeIssue(error.message)],
      cause: error,
    };
  }

  return undefined;
}

function sanitizeIssue(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 500);
}

function buildCorrectionPrompt(
  originalPrompt: string,
  responseName: string,
  issues: readonly string[],
): string {
  const issueList = issues.map((issue) => `- ${issue}`).join("\n");

  return `${originalPrompt}\n\nCORRECTION REQUIRED\n\nThe previous ${responseName} response was rejected:\n${issueList}\n\nReturn the complete response again as exactly one valid JSON object. Do not return markdown, code fences, comments, or explanatory text. Include every required field and obey every requested range and line-number constraint.`;
}
