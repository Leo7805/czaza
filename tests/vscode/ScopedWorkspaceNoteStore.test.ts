/**
 * Tests identity enforcement for project-scoped Team and Personal Note Stores.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  TEAM_NOTE_STORE,
  WorkspaceNoteStore,
  WorkspaceNoteStoreRepository,
} from "@vscode/notes";
import { describe, expect, it } from "vitest";

describe("ScopedWorkspaceNoteStore", () => {
  it("keeps omitted cache locations inside the bound Personal Store", async () => {
    const workspaceRoot = await createWorkspaceRoot("personal");
    const notes = new WorkspaceNoteStore(
      new WorkspaceNoteStoreRepository(() => "fixed001"),
    );
    const personal = { kind: "personal" as const, memberId: "leo-12345678" };
    const teamFile = createSourceFile("Team note.");
    const personalFile = createSourceFile("Personal note.");

    await notes.cache.saveSourceFile(
      workspaceRoot,
      ".czaza",
      "src/index.ts",
      teamFile,
      "2026-08-19T00:00:00.000Z",
      {},
      TEAM_NOTE_STORE,
    );
    await notes.cache.saveSourceFile(
      workspaceRoot,
      ".czaza",
      "src/index.ts",
      personalFile,
      "2026-08-19T00:00:00.000Z",
      {},
      personal,
    );

    const scoped = notes.scope(workspaceRoot, ".czaza", personal);

    await expect(
      scoped.cache.getSourceFile(workspaceRoot, ".czaza", "src/index.ts"),
    ).resolves.toMatchObject({ fileNote: { userNote: "Personal note." } });
    await expect(
      scoped.cache.getSourceFile(
        workspaceRoot,
        ".czaza",
        "src/index.ts",
        TEAM_NOTE_STORE,
      ),
    ).rejects.toThrow("cannot access a different Team or Personal location");
  });
});

/** Creates one isolated project directory for repository-backed Store tests. */
async function createWorkspaceRoot(name: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `czaza-scoped-store-${name}-`));
}

/** Creates one minimal stored bundle with a distinguishable File Note. */
function createSourceFile(userNote: string): StoredSourceFile {
  const timestamp = "2026-08-19T00:00:00.000Z";
  return {
    source: { sourceHash: "sha256:source", programmingLanguage: "typescript" },
    fileNote: {
      id: "file",
      userNote,
      status: { content: "current", anchor: "confirmed" },
      createdBy: "user",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    sectionNotes: [],
    lineNotes: [],
  };
}
