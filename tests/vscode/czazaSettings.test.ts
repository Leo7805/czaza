/** Unit tests for validated VS Code CZaza settings. */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
}));

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => ({
      get: <T>(key: string, defaultValue?: T): T | undefined =>
        (mocks.values.has(key) ? mocks.values.get(key) : defaultValue) as T | undefined,
    }),
  },
}));

import { getCzazaSettings } from "@vscode/config/czazaSettings";

describe("getCzazaSettings()", () => {
  beforeEach(() => {
    mocks.values.clear();
  });

  it("uses the default AI analysis line limit when the setting is empty", () => {
    expect(getCzazaSettings().ai.maxAnalysisLines).toBe(300);
  });

  it("uses a valid configured AI analysis line limit", () => {
    mocks.values.set("ai.maxAnalysisLines", 450);

    expect(getCzazaSettings().ai.maxAnalysisLines).toBe(450);
  });

  it.each([0, -1, 1.5, "500"])("falls back for invalid line limit %j", (value) => {
    mocks.values.set("ai.maxAnalysisLines", value);

    expect(getCzazaSettings().ai.maxAnalysisLines).toBe(300);
  });
});
