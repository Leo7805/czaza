/**
 * Unit tests for stale-status menu eligibility in Note cards.
 */

import { canClearContentStaleStatus } from "@webview/noteStatusActions";
import { describe, expect, it } from "vitest";

describe("canClearContentStaleStatus()", () => {
  it("allows legacy persistent stale content without Runtime State", () => {
    expect(
      canClearContentStaleStatus(
        { content: "stale", anchor: "confirmed" },
        undefined,
      ),
    ).toBe(true);
  });

  it("allows pure Runtime stale content with an unchanged anchor", () => {
    expect(
      canClearContentStaleStatus(
        { content: "stale", anchor: "confirmed" },
        { content: "stale", anchor: "confirmed" },
      ),
    ).toBe(true);
  });

  it("allows stale content that also needs location confirmation", () => {
    expect(
      canClearContentStaleStatus(
        { content: "stale", anchor: "needsConfirmation" },
        { content: "stale", anchor: "needsConfirmation" },
      ),
    ).toBe(true);
  });

  it("rejects current content", () => {
    expect(
      canClearContentStaleStatus(
        { content: "current", anchor: "confirmed" },
        undefined,
      ),
    ).toBe(false);
  });
});
