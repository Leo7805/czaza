/** Tests the initial Navigator Mode shell and its current-file labels. */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  getNavigatorBadge,
  getNavigatorHeading,
  NotesNavigatorView,
} from "@vscode/webview-ui/src/components/NotesNavigatorView";
import type { NavigatorNotesViewModel } from "@vscode/webview-ui/src/types";

describe("NotesNavigatorView", () => {
  it("labels the lists as project files and notes in the current file", () => {
    const notes: NavigatorNotesViewModel = {
      kind: "resource",
      projectRootName: "czaza",
      currentFile: "src/index.ts",
      files: [],
      sections: [],
      lines: [],
    };

    const markup = renderToStaticMarkup(<NotesNavigatorView navigatorNotes={notes} />);

    expect(markup).toContain("Files");
    expect(markup).toContain("Sections");
    expect(markup).toContain("Lines");
    expect(markup).toContain("Project File Notes");
    expect(markup).toContain("No file notes found.");
    expect(getNavigatorHeading("sections")).toBe("Sections in current file");
    expect(getNavigatorHeading("lines")).toBe("Lines in current file");
    expect(getNavigatorBadge("files", undefined, "czaza")).toBe("czaza");
    expect(getNavigatorBadge("sections", "src/index.ts", "czaza")).toBe("src/index.ts");
    expect(getNavigatorBadge("lines", undefined, "czaza")).toBe("No current file");
  });
});
