import { describe, expect, it } from "vitest";
import { updateFileNoteStatus } from "@shared/services/notes/noteStatusService";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";

describe("updateFileNoteStatus()", () => {
  it("does not refresh updatedAt when the status is unchanged", () => {
    const sourceFile: StoredSourceFile = {
      source: { sourceHash: "sha256:source", programmingLanguage: "typescript" },
      fileNote: {
        id: "file",
        userNote: "A note.",
        status: { content: "stale", anchor: "confirmed" },
        createdBy: "user",
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
      },
      sectionNotes: [],
      lineNotes: [],
    };

    const next = updateFileNoteStatus(
      sourceFile,
      { content: "stale", anchor: "confirmed" },
      "2026-07-14T00:00:00.000Z",
    );

    expect(next.fileNote).toBe(sourceFile.fileNote);
  });
});
