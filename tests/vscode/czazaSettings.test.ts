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

  it("uses compact editor typography defaults for notes", () => {
    expect(getCzazaSettings().notes).toEqual({
      fontFamily: "editor",
      fontSize: 12,
    });
  });

  it.each(["editor", "ui", "monospace"])("accepts the %s notes font family", (fontFamily) => {
    mocks.values.set("notes.fontFamily", fontFamily);

    expect(getCzazaSettings().notes.fontFamily).toBe(fontFamily);
  });

  it.each([0, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])(
    "accepts the %d notes font size",
    (fontSize) => {
      mocks.values.set("notes.fontSize", fontSize);

      expect(getCzazaSettings().notes.fontSize).toBe(fontSize);
    },
  );

  it("falls back when notes typography settings are unsupported", () => {
    mocks.values.set("notes.fontFamily", "comic-sans");
    mocks.values.set("notes.fontSize", 24);

    expect(getCzazaSettings().notes).toEqual({
      fontFamily: "editor",
      fontSize: 12,
    });
  });
});
