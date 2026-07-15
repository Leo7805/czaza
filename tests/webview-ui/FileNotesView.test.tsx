/**
 * Tests the static markup generated for file, section, and line note previews.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FileNotesView } from "@vscode/webview-ui/src/components/FileNotesView";
import type { ResourceNotesViewModel } from "@vscode/webview-ui/src/types";

describe("FileNotesView", () => {
  it("shows the first matched section, all section options, and one line preview", () => {
    const notes: Extract<ResourceNotesViewModel, { kind: "file" }> = {
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "regenerate",
      activeLine: 12,
      fileNote: {
        userNote: "File user note.\nSecond file note line.",
        aiExplanation: {
          summary: "File AI note.",
          detail: "File AI detail.",
        },
      },
      sectionNotes: [
        {
          id: "section:first",
          title: "Outer section",
          kind: "container",
          startLine: 1,
          endLine: 30,
          userNote: "First section content.\nSecond section line.",
        },
        {
          id: "section:second",
          title: "Inner section",
          startLine: 10,
          endLine: 20,
          userNote: "Second section content.",
        },
      ],
      lineNote: {
        id: "line:12",
        line: 12,
        userNote: "Current line content.\nLine note detail.",
      },
    };

    const markup = renderToStaticMarkup(<FileNotesView notes={notes} />);

    console.log("File notes markup:\n" + formatMarkup(markup));

    expect(markup).toContain("Section Notes");
    expect(markup).not.toContain("Component Notes");
    expect(markup).toContain("First section content.");
    expect(markup).toContain("Second section line.");
    expect(markup).not.toContain("Second section content.");
    expect(markup).toContain("Outer section · L1-30");
    expect(markup).toContain("Inner section · L10-20");
    expect(markup).toContain(">container</span>");
    expect(markup).not.toContain("Kind:");
    expect(markup).not.toContain("Lines:");
    expect(markup).toContain("tooltip tooltip--section");
    expect(markup).toContain("Line 12");
    expect(markup).toContain("Current line content.");
    expect(markup).toContain("Line note detail.");
    expect(markup.match(/user-note-edit-button/g)).toHaveLength(3);
  });

  it("shows a single-line section badge and the active line without note content", () => {
    const notes: Extract<ResourceNotesViewModel, { kind: "file" }> = {
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "regenerate",
      activeLine: 12,
      sectionNotes: [
        {
          id: "section:single-line",
          title: "Single-line section",
          kind: "statement",
          startLine: 12,
          endLine: 12,
          aiExplanation: {
            summary: "Single-line AI note.",
            detail: "Single-line AI detail.",
          },
        },
      ],
    };

    const markup = renderToStaticMarkup(<FileNotesView notes={notes} />);

    expect(markup).toContain('class="source-location-badge"');
    expect(markup).toContain("Single-line section · L12");
    expect(markup).toContain(">statement</span>");
    expect(markup).not.toContain("Kind:");
    expect(markup).not.toContain("Lines:");
    expect(markup).toContain("Line 12");
    expect(markup).toContain("No line note selected.");
    expect(markup).toContain('notes-card notes-card--line notes-card--user notes-card--empty');
    expect(markup).not.toContain("L12-12");
  });

  it("shows generated file and section AI notes after a successful request", () => {
    const notes: Extract<ResourceNotesViewModel, { kind: "file" }> = {
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "regenerate",
      revealAiNotes: "fileSection",
      fileNote: {
        userNote: "File user note.",
        aiExplanation: {
          summary: "Generated file AI note.",
          detail: "Generated file AI detail.",
          aiNotes: ["Generated file observation."],
        },
      },
      sectionNotes: [
        {
          id: "section:first",
          title: "Generated section",
          startLine: 1,
          endLine: 10,
          userNote: "Section user note.",
          aiExplanation: {
            summary: "Generated section AI note.",
            detail: "Generated section AI detail.",
            aiNotes: ["Generated section observation."],
          },
        },
      ],
    };

    const markup = renderToStaticMarkup(<FileNotesView notes={notes} />);

    expect(markup).toContain("Generated file AI note.");
    expect(markup).toContain("Generated file AI detail.");
    expect(markup).toContain("Generated file observation.");
    expect(markup).toContain("Generated section AI note.");
    expect(markup).toContain("Generated section AI detail.");
    expect(markup).toContain("Generated section observation.");
    expect(markup).not.toContain("File user note.");
    expect(markup).not.toContain("Section user note.");
    expect(markup).not.toContain("user-note-edit-button");
  });

  it("shows line AI notes after successful All Notes generation", () => {
    const notes: Extract<ResourceNotesViewModel, { kind: "file" }> = {
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "regenerate",
      revealAiNotes: "all",
      activeLine: 12,
      sectionNotes: [],
      lineNote: {
        id: "line:12",
        line: 12,
        userNote: "Line user note.",
        aiExplanation: {
          summary: "Generated line AI note.",
          detail: "Generated line AI detail.",
        },
      },
    };

    const markup = renderToStaticMarkup(<FileNotesView notes={notes} />);

    expect(markup).toContain("Generated line AI note.");
    expect(markup).toContain("Generated line AI detail.");
    expect(markup).not.toContain("Line user note.");
  });

  it("shows the line Generate button in the AI tab", () => {
    const notes: Extract<ResourceNotesViewModel, { kind: "file" }> = {
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      revealAiNotes: "line",
      activeLine: 12,
      sectionNotes: [],
      lineNote: {
        id: "line:12",
        line: 12,
        userNote: "Line user note.",
      },
    };

    const markup = renderToStaticMarkup(<FileNotesView notes={notes} />);

    expect(markup).toContain("ai-generation-menu__main");
    expect(markup).toContain(">Generate</span>");
    expect(markup).toContain('title="Choose AI note generation scope"');
  });

  it("shows the selected section Regenerate button in the AI tab", () => {
    const notes: Extract<ResourceNotesViewModel, { kind: "file" }> = {
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "regenerate",
      revealAiNotes: "section",
      sectionNotes: [
        {
          id: "section:run:1-3",
          title: "Run function",
          startLine: 1,
          endLine: 3,
          aiExplanation: {
            summary: "Runs the operation.",
            detail: "This section contains the function body.",
          },
        },
      ],
    };

    const markup = renderToStaticMarkup(<FileNotesView notes={notes} />);

    expect(markup).toContain(">Regenerate</button>");
  });

  it("shows the shared timer badge while file AI generation is running", () => {
    const notes: Extract<ResourceNotesViewModel, { kind: "file" }> = {
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "generate",
      isAiActionRunning: true,
      sectionNotes: [],
    };

    const markup = renderToStaticMarkup(<FileNotesView notes={notes} />);

    expect(markup).toContain('class="resource-header__timer"');
    expect(markup).toContain("0s");
    expect(markup).toContain("Generating...");
  });

  it("keeps other AI actions disabled without labeling them as running", () => {
    const notes: Extract<ResourceNotesViewModel, { kind: "file" }> = {
      kind: "file",
      name: "index.ts",
      relativePath: "src/index.ts",
      aiAction: "regenerate",
      revealAiNotes: "all",
      aiActionRunningScope: "line",
      activeLine: 12,
      fileNote: {
        aiExplanation: { summary: "File summary.", detail: "File detail." },
      },
      sectionNotes: [
        {
          id: "section:run:1-3",
          title: "Run function",
          startLine: 1,
          endLine: 3,
          aiExplanation: { summary: "Section summary.", detail: "Section detail." },
        },
      ],
      lineNote: {
        id: "line:12",
        line: 12,
        aiExplanation: { summary: "Line summary.", detail: "Line detail." },
      },
    };

    const markup = renderToStaticMarkup(<FileNotesView notes={notes} />);

    expect(markup).toContain(">Regenerating...</span>");
    expect(markup.match(/>Regenerating\.\.\.<\/span>/g)).toHaveLength(1);
    expect(markup).toContain('title="Regenerate AI notes"');
    expect(markup).toContain('class="ai-note-content__action" type="button" disabled');
  });
});

/**
 * Adds line breaks between adjacent HTML tags for readable test output.
 *
 * @param markup - Static HTML markup generated by React.
 * @returns Markup with one adjacent tag boundary per line.
 */
function formatMarkup(markup: string): string {
  return markup.replaceAll("><", ">\n<");
}
