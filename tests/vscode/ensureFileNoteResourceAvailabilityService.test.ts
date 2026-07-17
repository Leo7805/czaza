/**
 * Unit tests for lazy file-note resource availability checks.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { WorkspaceNoteStore, WorkspaceNoteStoreRepository } from "@vscode/notes";
import { ensureFileNoteResourceAvailability } from "@vscode/services/ensureFileNoteResourceAvailabilityService";

const mocks = vi.hoisted(() => ({
  randomId: "abcdef123456",
  stat: vi.fn(),
}));

vi.mock("vscode", () => ({
  Uri: {
    file: (fsPath: string) => ({
      scheme: "file",
      fsPath,
      toString: () => `file://${fsPath}`,
    }),
  },
  workspace: {
    fs: {
      stat: mocks.stat,
    },
  },
}));

const createdAt = "2026-07-12T00:00:00.000Z";

describe("ensureFileNoteResourceAvailability()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not change status when the resource exists", async () => {
    const root = await createTempWorkspaceRoot("exists");
    const notes = await createStoreWithSourceFile(root, "src/index.ts");

    mocks.stat.mockResolvedValue({ type: 1 });

    const result = await ensureFileNoteResourceAvailability({
      notes,
      workspaceRoot: root,
      outputDirectory: ".caca",
      relativePath: "src/index.ts",
      now: createdAt,
    });
    const sourceFile = await notes.cache.getSourceFile(root, ".caca", "src/index.ts");

    expect(result).toEqual({ available: true, changed: false });
    expect(sourceFile?.fileNote?.status).toEqual({
      content: "stale",
      anchor: "confirmed",
    });
  });

  it("marks a missing resource as needing confirmation while preserving stale content", async () => {
    const root = await createTempWorkspaceRoot("missing");
    const notes = await createStoreWithSourceFile(root, "src/missing.ts");

    mocks.stat.mockRejectedValue(new Error("Not found"));

    const result = await ensureFileNoteResourceAvailability({
      notes,
      workspaceRoot: root,
      outputDirectory: ".caca",
      relativePath: "src/missing.ts",
      now: createdAt,
    });
    const sourceFile = await notes.cache.getSourceFile(root, ".caca", "src/missing.ts");

    expect(result).toEqual({ available: false, changed: true });
    expect(sourceFile?.fileNote?.status).toEqual({
      content: "stale",
      anchor: "needsConfirmation",
    });
  });

  it("does not rewrite an already missing-confirmation resource", async () => {
    const root = await createTempWorkspaceRoot("already-missing");
    const sourceFile = createStoredSourceFile();
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => mocks.randomId));

    if (sourceFile.fileNote) {
      sourceFile.fileNote.status.anchor = "needsConfirmation";
    }

    await notes.cache.saveSourceFile(root, ".caca", "src/missing.ts", sourceFile, createdAt);
    mocks.stat.mockRejectedValue(new Error("Not found"));

    const result = await ensureFileNoteResourceAvailability({
      notes,
      workspaceRoot: root,
      outputDirectory: ".caca",
      relativePath: "src/missing.ts",
      now: createdAt,
    });

    expect(result).toEqual({ available: false, changed: false });
  });
});

async function createStoreWithSourceFile(
  workspaceRoot: string,
  relativePath: string,
): Promise<WorkspaceNoteStore> {
  const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => mocks.randomId));

  await notes.cache.saveSourceFile(workspaceRoot, ".caca", relativePath, createStoredSourceFile(), createdAt);

  return notes;
}

function createStoredSourceFile(): StoredSourceFile {
  return {
    source: {
      sourceHash: "sha256:source",
      programmingLanguage: "typescript",
    },
    fileNote: {
      id: "file",
      userNote: "File note.",
      status: {
        content: "stale",
        anchor: "confirmed",
      },
      createdBy: "user",
      createdAt,
      updatedAt: createdAt,
    },
    sectionNotes: [],
    lineNotes: [],
  };
}

async function createTempWorkspaceRoot(name: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `czaza-availability-${name}-`));
}
