/**
 * Unit tests for bounded content-aware User Note editor sizing.
 */

import { describe, expect, it } from "vitest";
import { calculateNoteEditorHeight } from "@vscode/webview-ui/src/noteEditorSizing";

describe("calculateNoteEditorHeight()", () => {
  it("uses the minimum height for short notes", () => {
    expect(calculateNoteEditorHeight(80, 900)).toBe(144);
  });

  it("grows to the full content height for medium notes", () => {
    expect(calculateNoteEditorHeight(260, 900)).toBe(260);
  });

  it("caps long notes at the fixed maximum", () => {
    expect(calculateNoteEditorHeight(900, 1200)).toBe(360);
  });

  it("caps notes at half of a smaller viewport", () => {
    expect(calculateNoteEditorHeight(500, 500)).toBe(250);
  });

  it("never shrinks below the minimum in a very small viewport", () => {
    expect(calculateNoteEditorHeight(500, 200)).toBe(144);
  });
});
