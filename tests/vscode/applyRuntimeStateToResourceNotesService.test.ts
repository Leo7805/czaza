/**
 * Unit tests for Runtime Note State overlays on File Notes payloads.
 */

import type { ResourceNotesResult } from "@vscode/services/getResourceNotesService";
import { applyRuntimeStateToResourceNotes } from "@vscode/services/runtimeState/applyRuntimeStateToResourceNotesService";
import type { RuntimeNoteState } from "@vscode/services/runtimeState/runtimeNoteState";
import { describe, expect, it } from "vitest";

describe("applyRuntimeStateToResourceNotes()", () => {
  it("overlays File, Section, and Line status and suggested locations", () => {
    const payload = createPayload();
    const state = createState();
    const result = applyRuntimeStateToResourceNotes(payload, state);

    expect(result).toEqual({
      ...payload,
      fileNote: {
        ...payload.fileNote,
        status: {
          content: "stale",
          anchor: "confirmed",
        },
      },
      sectionNotes: [
        {
          ...payload.sectionNotes[0],
          startLine: 12,
          endLine: 18,
          status: {
            content: "stale",
            anchor: "needsConfirmation",
          },
        },
      ],
      lineNote: {
        ...payload.lineNote,
        line: 14,
        status: {
          content: "stale",
          anchor: "needsConfirmation",
        },
      },
    });
  });

  it("does not mutate the persistent payload", () => {
    const payload = createPayload();
    const original = structuredClone(payload);

    applyRuntimeStateToResourceNotes(payload, createState());

    expect(payload).toEqual(original);
  });

  it("ignores target changes whose ids are not visible", () => {
    const payload = createPayload();
    const state = {
      ...createState(),
      targetChanges: [
        {
          kind: "section" as const,
          noteId: "section:other",
          status: {
            content: "stale" as const,
            anchor: "needsConfirmation" as const,
          },
        },
      ],
    };

    expect(applyRuntimeStateToResourceNotes(payload, state)).toEqual(payload);
  });

  it("ignores Runtime State for another source path", () => {
    const payload = createPayload();
    const state = {
      ...createState(),
      relativePath: "src/other.ts",
    };

    expect(applyRuntimeStateToResourceNotes(payload, state)).toBe(payload);
  });

  it("returns non-file payloads unchanged", () => {
    const payload: ResourceNotesResult = {
      kind: "directory",
      name: "src",
      relativePath: "src",
      children: [],
    };

    expect(applyRuntimeStateToResourceNotes(payload, createState())).toBe(payload);
  });
});

/**
 * Creates a File Notes payload with all three Note levels.
 *
 * @returns Persistent payload fixture.
 */
function createPayload(): Extract<ResourceNotesResult, { kind: "file" }> {
  return {
    kind: "file",
    name: "index.ts",
    relativePath: "src/index.ts",
    aiAction: "generate",
    activeLine: 10,
    fileNote: {
      userNote: "File note.",
      status: {
        content: "current",
        anchor: "confirmed",
      },
    },
    sectionNotes: [
      {
        id: "section:one",
        title: "Section",
        startLine: 10,
        endLine: 20,
        userNote: "Section note.",
        status: {
          content: "current",
          anchor: "confirmed",
        },
      },
    ],
    lineNote: {
      id: "line:one",
      line: 10,
      userNote: "Line note.",
      status: {
        content: "current",
        anchor: "confirmed",
      },
    },
  };
}

/**
 * Creates matching Runtime State overlays for all three Note levels.
 *
 * @returns Runtime State fixture.
 */
function createState(): RuntimeNoteState {
  return {
    workspaceRoot: "/workspace",
    outputDirectory: ".czaza",
    relativePath: "src/index.ts",
    currentSourceHash: "sha256:new",
    issues: ["stale", "locationReview"],
    reason: "anchorChanged",
    observedAt: "2026-07-29T00:00:00.000Z",
    targetChanges: [
      {
        kind: "file",
        status: {
          content: "stale",
          anchor: "confirmed",
        },
      },
      {
        kind: "section",
        noteId: "section:one",
        range: {
          startLine: 12,
          endLine: 18,
        },
        status: {
          content: "stale",
          anchor: "needsConfirmation",
        },
      },
      {
        kind: "line",
        noteId: "line:one",
        line: 14,
        status: {
          content: "stale",
          anchor: "needsConfirmation",
        },
      },
    ],
  };
}
