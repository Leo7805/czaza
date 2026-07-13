/**
 * Unit tests for workspace note index updates.
 */

import { describe, expect, it } from "vitest";
import type { WorkspaceNoteIndexV1 } from "@shared/models/store/workspace";
import {
  deleteSourceFileEntry,
  renameSourceFileEntry,
} from "@shared/services/notes/noteIndexService";

const createdAt = "2026-07-12T00:00:00.000Z";
const now = "2026-07-13T00:00:00.000Z";

describe("noteIndexService", () => {
  it("renames a source file entry while preserving the note file", () => {
    const index = createWorkspaceNoteIndex();
    const renamed = renameSourceFileEntry(index, "src/old.ts", "src/new.ts", now);

    expect(renamed).toEqual({
      schemaVersion: 1,
      updatedAt: now,
      workspaceRoot: "/workspace/project",
      files: {
        "src/other.ts": index.files["src/other.ts"],
        "src/new.ts": {
          noteFile: "files/old-note.json",
          sourceHash: "sha256:old",
          programmingLanguage: "typescript",
          updatedAt: now,
        },
      },
    });
    expect(index.files["src/old.ts"]).toBeDefined();
  });

  it("throws when renaming a missing source file entry", () => {
    expect(() =>
      renameSourceFileEntry(createWorkspaceNoteIndex(), "src/missing.ts", "src/new.ts", now),
    ).toThrow("Cannot rename source file note entry because the old path is missing: src/missing.ts");
  });

  it("throws when renaming to an existing source file entry", () => {
    expect(() =>
      renameSourceFileEntry(createWorkspaceNoteIndex(), "src/old.ts", "src/other.ts", now),
    ).toThrow("Cannot rename source file note entry because the new path already exists: src/other.ts");
  });

  it("deletes a source file entry without deleting other entries", () => {
    const index = createWorkspaceNoteIndex();
    const deleted = deleteSourceFileEntry(index, "src/old.ts", now);

    expect(deleted).toEqual({
      schemaVersion: 1,
      updatedAt: now,
      workspaceRoot: "/workspace/project",
      files: {
        "src/other.ts": index.files["src/other.ts"],
      },
    });
    expect(index.files["src/old.ts"]).toBeDefined();
  });

  it("returns the same index when deleting a missing source file entry", () => {
    const index = createWorkspaceNoteIndex();

    expect(deleteSourceFileEntry(index, "src/missing.ts", now)).toBe(index);
  });
});

/**
 * Creates a workspace note index with two file entries.
 *
 * @returns Workspace note index fixture.
 *
 * @example
 * const index = createWorkspaceNoteIndex();
 */
function createWorkspaceNoteIndex(): WorkspaceNoteIndexV1 {
  return {
    schemaVersion: 1,
    updatedAt: createdAt,
    workspaceRoot: "/workspace/project",
    files: {
      "src/old.ts": {
        noteFile: "files/old-note.json",
        sourceHash: "sha256:old",
        programmingLanguage: "typescript",
        updatedAt: createdAt,
      },
      "src/other.ts": {
        noteFile: "files/other-note.json",
        sourceHash: "sha256:other",
        programmingLanguage: "typescript",
        updatedAt: createdAt,
      },
    },
  };
}
