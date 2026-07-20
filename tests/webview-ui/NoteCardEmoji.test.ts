/** Tests text insertion behavior shared by the note editor emoji picker. */

import { describe, expect, it } from "vitest";

import { replaceEditorSelection } from "@vscode/webview-ui/src/editorTextUtils";

describe("replaceEditorSelection", () => {
  it("inserts an emoji at the saved caret", () => {
    expect(replaceEditorSelection("hello world", { start: 6, end: 6 }, "😀")).toBe(
      "hello 😀world",
    );
  });

  it("replaces the saved selection with an emoji", () => {
    expect(replaceEditorSelection("hello world", { start: 6, end: 11 }, "🎉")).toBe(
      "hello 🎉",
    );
  });
});
