/** Tests the initial Navigator Mode shell and its current-file labels. */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  getNavigatorBadge,
  getNavigatorHeading,
  getNavigatorItemClassName,
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

  it("renders different resource icons for files and directories", () => {
    const notes: NavigatorNotesViewModel = {
      kind: "resource",
      projectRootName: "czaza",
      currentFile: "src/index.ts",
      files: [
        {
          name: "src",
          relativePath: "src",
          resourceKind: "directory",
          preview: "Source folder notes",
        },
        {
          name: "index.ts",
          relativePath: "src/index.ts",
          resourceKind: "file",
          preview: "Entry file notes",
        },
      ],
      sections: [],
      lines: [],
    };

    const markup = renderToStaticMarkup(<NotesNavigatorView navigatorNotes={notes} />);

    expect(markup).toContain("notes-navigator__resource-icon--directory");
    expect(markup).toContain("notes-navigator__resource-icon--file");
  });

  it("renders note status badges at the end of navigator rows", () => {
    const notes: NavigatorNotesViewModel = {
      kind: "resource",
      projectRootName: "czaza",
      currentFile: "src/index.ts",
      files: [
        {
          name: "index.ts",
          relativePath: "src/index.ts",
          resourceKind: "file",
          preview: "Entry file notes",
          status: {
            content: "stale",
            anchor: "orphaned",
          },
        },
      ],
      sections: [],
      lines: [],
    };

    const markup = renderToStaticMarkup(<NotesNavigatorView navigatorNotes={notes} />);

    expect(markup).toContain("notes-navigator__item-meta");
    expect(markup).toContain("note-status-badge--stale");
    expect(markup).toContain("note-status-badge--orphaned");
    expect(markup).toContain("Content stale");
    expect(markup).toContain("Orphaned");
  });

  it("marks current navigator rows with a shared current class", () => {
    expect(getNavigatorItemClassName("file", { isCurrent: true })).toContain(
      "notes-navigator__item--current",
    );
    expect(getNavigatorItemClassName("section", { isCurrent: true })).toContain(
      "notes-navigator__item--section",
    );
    expect(getNavigatorItemClassName("line", { isCurrent: true })).toContain(
      "notes-navigator__item--line",
    );
    expect(getNavigatorItemClassName("file", { isOrphaned: true })).toContain(
      "notes-navigator__item--orphaned",
    );
  });
});
