/** Unit tests for shared structured AI response recovery. */

import { describe, expect, it, vi } from "vitest";

import type { AiClient } from "@shared/ai/aiClient";
import {
  completeStructuredAiResponse,
  StructuredAiResponseError,
} from "@shared/services/structuredAiResponseService";

describe("completeStructuredAiResponse()", () => {
  it("returns a valid first response without retrying", async () => {
    const complete = vi.fn().mockResolvedValue('{"ok":true}');

    const result = await completeStructuredAiResponse({
      prompt: "Return JSON.",
      aiClient: { complete },
      responseName: "test",
      parseAndValidate: (value) => JSON.parse(value) as { ok: boolean },
    });

    expect(result).toEqual({ ok: true });
    expect(complete).toHaveBeenCalledOnce();
  });

  it("retries invalid JSON with a correction prompt", async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce('{"ok":')
      .mockResolvedValueOnce('{"ok":true}');

    await expect(
      completeStructuredAiResponse({
        prompt: "Return JSON.",
        aiClient: { complete },
        responseName: "test",
        parseAndValidate: (value) => JSON.parse(value) as { ok: boolean },
      }),
    ).resolves.toEqual({ ok: true });

    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1]?.[0]).toContain("CORRECTION REQUIRED");
    expect(complete.mock.calls[1]?.[0]).toContain("Return JSON.");
    expect(complete.mock.calls[1]?.[0]).not.toContain('{"ok":');
  });

  it("retries DTO validation errors", async () => {
    const complete = vi.fn().mockResolvedValueOnce("{}").mockResolvedValueOnce('{"ok":true}');

    const result = await completeStructuredAiResponse({
      prompt: "Return JSON.",
      aiClient: { complete },
      responseName: "test",
      parseAndValidate(value) {
        const parsed = JSON.parse(value) as { ok?: boolean };
        if (parsed.ok !== true) {
          throw new Error("Invalid test response: ok must be true.");
        }
        return parsed;
      },
    });

    expect(result).toEqual({ ok: true });
    expect(complete.mock.calls[1]?.[0]).toContain("ok must be true");
  });

  it("throws one stable error after recovery is exhausted", async () => {
    const complete = vi.fn().mockResolvedValue('{"ok":');

    await expect(
      completeStructuredAiResponse({
        prompt: "Return JSON.",
        aiClient: { complete },
        responseName: "test",
        parseAndValidate: (value) => JSON.parse(value) as unknown,
      }),
    ).rejects.toMatchObject({
      name: "StructuredAiResponseError",
      kind: "invalid-json",
      attempts: 2,
    } satisfies Partial<StructuredAiResponseError>);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("does not retry provider or authentication failures", async () => {
    const complete = vi.fn().mockRejectedValue(new Error("DeepSeek request failed (401)."));

    await expect(
      completeStructuredAiResponse({
        prompt: "Return JSON.",
        aiClient: { complete } as AiClient,
        responseName: "test",
        parseAndValidate: JSON.parse,
      }),
    ).rejects.toThrow("401");
    expect(complete).toHaveBeenCalledOnce();
  });

  it("does not blindly retry token-limit truncation", async () => {
    const complete = vi
      .fn()
      .mockRejectedValue(new Error("DeepSeek response was truncated because it reached the output token limit."));

    await expect(
      completeStructuredAiResponse({
        prompt: "Return JSON.",
        aiClient: { complete },
        responseName: "test",
        parseAndValidate: JSON.parse,
      }),
    ).rejects.toThrow("token limit");
    expect(complete).toHaveBeenCalledOnce();
  });
});
