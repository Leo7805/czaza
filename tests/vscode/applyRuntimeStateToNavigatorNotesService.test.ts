/**
 * Unit tests for Runtime status overlays on Navigator payloads.
 */

import type { NavigatorNotesResult } from "@vscode/services/getNavigatorNotesService";
import { applyRuntimeStateToNavigatorNotes } from "@vscode/services/runtimeState/applyRuntimeStateToNavigatorNotesService";
import type { RuntimeNoteState } from "@vscode/services/runtimeState/runtimeNoteState";
import { describe, expect, it } from "vitest";

describe("applyRuntimeStateToNavigatorNotes()", () => {
  it("overlays all Note levels without replacing persisted locations", () => {
    const payload = createPayload();
    const result = applyRuntimeStateToNavigatorNotes(payload, [createState()]);

    expect(result.kind).toBe("resource");
    if (result.kind !== "resource") {
      return;
    }

    expect(result.files[0]).toMatchObject({
      status: { content: "stale", anchor: "confirmed" },
      runtimeStatus: { content: "stale", anchor: "confirmed" },
    });
    expect(result.sections[0]).toMatchObject({
      startLine: 10,
      endLine: 20,
      status: { content: "stale", anchor: "needsConfirmation" },
      runtimeStatus: { content: "stale", anchor: "needsConfirmation" },
    });
    expect(result.lines[0]).toMatchObject({
      line: 10,
      status: { content: "stale", anchor: "needsConfirmation" },
      runtimeStatus: { content: "stale", anchor: "needsConfirmation" },
    });
  });

  it("does not mutate persistent Navigator data", () => {
    const payload = createPayload();
    const original = structuredClone(payload);

    applyRuntimeStateToNavigatorNotes(payload, [createState()]);

    expect(payload).toEqual(original);
  });

  it("ignores Runtime targets for non-current Section and Line lists", () => {
    const payload = createPayload();
    const state = { ...createState(), relativePath: "src/other.ts" };
    const result = applyRuntimeStateToNavigatorNotes(payload, [state]);

    expect(result).toBeInstanceOf(Object);
    if (result.kind === "resource") {
      expect(result.sections).toEqual(payload.kind === "resource" ? payload.sections : []);
      expect(result.lines).toEqual(payload.kind === "resource" ? payload.lines : []);
    }
  });
});

/**
 * Creates a Navigator payload with all three Note levels.
 *
 * @returns Persistent Navigator fixture.
 */
function createPayload(): Extract<NavigatorNotesResult, { kind: "resource" }> {
  return {
    kind: "resource",
    projectRootName: "workspace",
    currentFile: "src/index.ts",
    files: [
      {
        name: "index.ts",
        relativePath: "src/index.ts",
        resourceKind: "file",
        preview: "File",
        status: { content: "current", anchor: "confirmed" },
      },
    ],
    sections: [
      {
        id: "section:one",
        title: "Section",
        preview: "Section",
        startLine: 10,
        endLine: 20,
        status: { content: "current", anchor: "confirmed" },
      },
    ],
    lines: [
      {
        id: "line:one",
        line: 10,
        anchorText: "const value = 1;",
        preview: "Line",
        status: { content: "current", anchor: "confirmed" },
      },
    ],
  };
}

/**
 * Creates Runtime changes with different proposed positions.
 *
 * @returns Runtime State fixture for the current Navigator file.
 */
function createState(): RuntimeNoteState {
  return {
    workspaceRoot: "/workspace",
    outputDirectory: ".czaza",
    relativePath: "src/index.ts",
    currentSourceHash: "sha256:new",
    issues: ["stale", "locationReview"],
    reason: "anchorChanged",
    observedAt: "2026-07-30T00:00:00.000Z",
    targetChanges: [
      {
        kind: "file",
        status: { content: "stale", anchor: "confirmed" },
      },
      {
        kind: "section",
        noteId: "section:one",
        range: { startLine: 12, endLine: 18 },
        status: { content: "stale", anchor: "needsConfirmation" },
      },
      {
        kind: "line",
        noteId: "line:one",
        line: 14,
        status: { content: "stale", anchor: "needsConfirmation" },
      },
    ],
  };
}
