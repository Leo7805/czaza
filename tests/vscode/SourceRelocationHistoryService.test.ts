/**
 * Unit tests for hash-validated in-memory source relocation history.
 */

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { SourceRelocationHistoryService } from "@vscode/services/noteRelocation/sourceChanges/SourceRelocationHistoryService";
import { describe, expect, it } from "vitest";

const resourceKey = "file:///workspace/src/index.ts";

describe("SourceRelocationHistoryService", () => {
  it("restores relocation fields without overwriting user-authored Note content", () => {
    const history = new SourceRelocationHistoryService();
    const before = createSourceFile("before", 10, "current");
    const after = createSourceFile("after", 11, "stale");

    history.record(resourceKey, before, after);
    const current = {
      ...after,
      sectionNotes: after.sectionNotes.map((note) => ({
        ...note,
        userNote: "Edited after relocation.",
      })),
    };
    const prepared = history.prepareUndo(resourceKey, current, "before");

    expect(prepared.kind).toBe("ready");
    if (prepared.kind !== "ready") {
      return;
    }

    expect(prepared.sourceFile.source.sourceHash).toBe("before");
    expect(prepared.sourceFile.sectionNotes[0]?.range).toEqual({
      startLine: 10,
      endLine: 12,
    });
    expect(prepared.sourceFile.sectionNotes[0]?.status.content).toBe("current");
    expect(prepared.sourceFile.sectionNotes[0]?.userNote).toBe(
      "Edited after relocation.",
    );
    expect(history.commitUndo(resourceKey, prepared.entryId)).toBe(true);
  });

  it("moves a committed entry through Undo and Redo stacks", () => {
    const history = new SourceRelocationHistoryService();
    const before = createSourceFile("before", 10, "current");
    const after = createSourceFile("after", 11, "stale");

    history.record(resourceKey, before, after);
    const undo = history.prepareUndo(resourceKey, after, "before");
    expect(undo.kind).toBe("ready");
    if (undo.kind !== "ready") {
      return;
    }
    history.commitUndo(resourceKey, undo.entryId);

    const redo = history.prepareRedo(resourceKey, undo.sourceFile, "after");
    expect(redo.kind).toBe("ready");
    if (redo.kind !== "ready") {
      return;
    }

    expect(redo.sourceFile.source.sourceHash).toBe("after");
    expect(redo.sourceFile.sectionNotes[0]?.range).toEqual({
      startLine: 11,
      endLine: 13,
    });
    expect(history.commitRedo(resourceKey, redo.entryId)).toBe(true);
  });

  it("preserves Section and Line location review through Undo and Redo", () => {
    const history = new SourceRelocationHistoryService();
    const before = createSourceFile("before", 10, "stale");
    const after = createSourceFile("after", 11, "stale");

    before.sectionNotes[0]!.status.anchor = "needsConfirmation";
    before.lineNotes[0]!.status.anchor = "needsConfirmation";
    after.sectionNotes[0]!.status.anchor = "needsConfirmation";
    after.lineNotes[0]!.status.anchor = "needsConfirmation";
    history.record(resourceKey, before, after);

    const undo = history.prepareUndo(resourceKey, after, "before");
    expect(undo.kind).toBe("ready");
    if (undo.kind !== "ready") {
      return;
    }

    expect(undo.sourceFile.sectionNotes[0]).toMatchObject({
      range: { startLine: 10, endLine: 12 },
      status: { content: "stale", anchor: "needsConfirmation" },
    });
    expect(undo.sourceFile.lineNotes[0]).toMatchObject({
      line: 10,
      status: { content: "stale", anchor: "needsConfirmation" },
    });
    history.commitUndo(resourceKey, undo.entryId);

    const redo = history.prepareRedo(resourceKey, undo.sourceFile, "after");
    expect(redo.kind).toBe("ready");
    if (redo.kind !== "ready") {
      return;
    }

    expect(redo.sourceFile.sectionNotes[0]).toMatchObject({
      range: { startLine: 11, endLine: 13 },
      status: { content: "stale", anchor: "needsConfirmation" },
    });
    expect(redo.sourceFile.lineNotes[0]).toMatchObject({
      line: 11,
      status: { content: "stale", anchor: "needsConfirmation" },
    });
  });

  it("clears resource history when either validation hash mismatches", () => {
    const history = new SourceRelocationHistoryService();
    const before = createSourceFile("before", 10, "current");
    const after = createSourceFile("after", 11, "stale");

    history.record(resourceKey, before, after);

    expect(history.prepareUndo(resourceKey, after, "unexpected")).toEqual({
      kind: "mismatch",
    });
    expect(history.prepareUndo(resourceKey, after, "before")).toEqual({
      kind: "unavailable",
    });
  });

  it("limits retained Undo entries for each resource", () => {
    const history = new SourceRelocationHistoryService(1);
    const first = createSourceFile("first", 10, "current");
    const second = createSourceFile("second", 11, "stale");
    const third = createSourceFile("third", 12, "stale");

    history.record(resourceKey, first, second);
    history.record(resourceKey, second, third);
    const latestUndo = history.prepareUndo(resourceKey, third, "second");

    expect(latestUndo.kind).toBe("ready");
    if (latestUndo.kind !== "ready") {
      return;
    }
    history.commitUndo(resourceKey, latestUndo.entryId);

    expect(history.prepareUndo(resourceKey, latestUndo.sourceFile, "first")).toEqual({
      kind: "unavailable",
    });
  });
});

/**
 * Creates persistent Notes with concise relocation-owned state.
 *
 * @param sourceHash - Source hash represented by the fixture.
 * @param startLine - Section start and Line Note location.
 * @param contentStatus - Content status stored on every Note target.
 * @returns Persistent source Note fixture.
 */
function createSourceFile(
  sourceHash: string,
  startLine: number,
  contentStatus: "current" | "stale",
): StoredSourceFile {
  return {
    source: { sourceHash },
    fileNote: {
      id: "file",
      userNote: "File note.",
      status: { content: contentStatus, anchor: "confirmed" },
      createdBy: "user",
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
    },
    sectionNotes: [
      {
        id: "section",
        title: "Section",
        range: { startLine, endLine: startLine + 2 },
        anchorHash: "anchor",
        userNote: "Original user note.",
        status: { content: contentStatus, anchor: "confirmed" },
        createdBy: "user",
        createdAt: "2026-07-30T00:00:00.000Z",
        updatedAt: "2026-07-30T00:00:00.000Z",
      },
    ],
    lineNotes: [
      {
        id: "line",
        line: startLine,
        anchorText: "anchor",
        userNote: "Line note.",
        status: { content: contentStatus, anchor: "confirmed" },
        createdBy: "user",
        createdAt: "2026-07-30T00:00:00.000Z",
        updatedAt: "2026-07-30T00:00:00.000Z",
      },
    ],
  };
}
