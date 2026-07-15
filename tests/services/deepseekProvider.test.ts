/**
 * Unit tests for DeepSeek request options and response termination handling.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { callDeepSeek } from "@shared/providers/deepseek";

describe("callDeepSeek()", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests JSON output and sends a configured max_tokens value", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            finish_reason: "stop",
            message: { content: '{"ok":true}' },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callDeepSeek("Return JSON.", {
        apiKey: "test-key",
        maxTokens: 12_000,
      }),
    ).resolves.toBe('{"ok":true}');

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      max_tokens: 12_000,
      response_format: { type: "json_object" },
    });
  });

  it("omits max_tokens when no output cap is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            finish_reason: "stop",
            message: { content: "{}" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await callDeepSeek("Return JSON.", { apiKey: "test-key" });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));

    expect(body).not.toHaveProperty("max_tokens");
    expect(body).toMatchObject({ response_format: { type: "json_object" } });
  });

  it("rejects a response truncated by the output token limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createJsonResponse({
          choices: [
            {
              finish_reason: "length",
              message: { content: '{"incomplete":' },
            },
          ],
        }),
      ),
    );

    await expect(
      callDeepSeek("Return JSON.", { apiKey: "test-key", maxTokens: 64_000 }),
    ).rejects.toThrow(
      "DeepSeek response was truncated because it reached the output token limit.",
    );
  });

  it("rejects an invalid maxTokens value before sending a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callDeepSeek("Return JSON.", { apiKey: "test-key", maxTokens: 0 }),
    ).rejects.toThrow("DeepSeek maxTokens must be a positive integer.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty JSON Mode response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createJsonResponse({
          choices: [
            {
              finish_reason: "stop",
              message: { content: "   " },
            },
          ],
        }),
      ),
    );

    await expect(callDeepSeek("Return JSON.", { apiKey: "test-key" })).rejects.toThrow(
      "DeepSeek returned an empty JSON response.",
    );
  });
});

/**
 * Creates a successful JSON HTTP response for the provider test double.
 *
 * @param body - DeepSeek-compatible response payload.
 * @returns Successful Response containing the serialized payload.
 */
function createJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
