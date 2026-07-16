/** Tests the initial Navigator Mode shell and its current-file labels. */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  getNavigatorHeading,
  NotesNavigatorView,
} from "@vscode/webview-ui/src/components/NotesNavigatorView";
import type { ResourceNotesViewModel } from "@vscode/webview-ui/src/types";

describe("NotesNavigatorView", () => {
  it("labels the lists as project files and notes in the current file", () => {
    const notes: Extract<ResourceNotesViewModel, { kind: "file" }> = {
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "regenerate",
      sectionNotes: [],
    };

    const markup = renderToStaticMarkup(<NotesNavigatorView notes={notes} />);

    expect(markup).toContain("Files");
    expect(markup).toContain("Sections");
    expect(markup).toContain("Lines");
    expect(markup).toContain("Project File Notes");
    expect(markup).toContain("No notes loaded yet.");
    expect(getNavigatorHeading("sections", "src/index.ts")).toBe(
      "Sections in current file: src/index.ts",
    );
    expect(getNavigatorHeading("lines", "src/index.ts")).toBe(
      "Lines in current file: src/index.ts",
    );
  });
});
