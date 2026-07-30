/**
 * Verifies real filesystem Delete and same-path recreation never persist Notes.
 */

import assert from "node:assert/strict";
import {
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import * as path from "node:path";

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { createSourceHash } from "@shared/utils/hashUtils";
import { WorkspaceNoteStore } from "@vscode/notes";

const OUTPUT_DIRECTORY = ".czaza";
const RELATIVE_SOURCE_PATH = "src/index.ts";
const ORIGINAL_SOURCE = "export const value = 1;\n";
const RECREATED_SOURCE = "export const replacement = 2;\n";
const CREATED_AT = "2026-07-30T00:00:00.000Z";
const WATCHER_SETTLE_MS = 1500;

/** Prepared filesystem state used across extension activation. */
export type ExternalFileLifecycleFixture = {
  workspaceRoot: string;
  sourcePath: string;
  notesDirectory: string;
  baselineNotes: Record<string, string>;
};

/**
 * Creates one tracked source and Note Store before CZaza activates.
 *
 * @param workspaceRoot - Isolated Extension Host workspace root.
 * @returns Prepared source paths and the initial byte-level Notes snapshot.
 */
export async function prepareExternalFileLifecycleFixture(
  workspaceRoot: string,
): Promise<ExternalFileLifecycleFixture> {
  const sourcePath = path.join(workspaceRoot, RELATIVE_SOURCE_PATH);
  const notes = new WorkspaceNoteStore();

  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, ORIGINAL_SOURCE, "utf8");
  await notes.cache.saveSourceFile(
    workspaceRoot,
    OUTPUT_DIRECTORY,
    RELATIVE_SOURCE_PATH,
    createStoredSourceFile(),
    CREATED_AT,
  );

  const notesDirectory = path.join(
    workspaceRoot,
    OUTPUT_DIRECTORY,
    "notes",
  );

  return {
    workspaceRoot,
    sourcePath,
    notesDirectory,
    baselineNotes: await snapshotTextFiles(notesDirectory),
  };
}

/**
 * Deletes and recreates the tracked source through Node's real filesystem APIs.
 *
 * @param fixture - Prepared source and immutable Note Store baseline.
 * @returns Promise resolved after both real Watcher quiet periods are verified.
 */
export async function runExternalFileLifecycleRegression(
  fixture: ExternalFileLifecycleFixture,
): Promise<void> {
  await unlink(fixture.sourcePath);
  await waitForWatcher();
  assert.deepEqual(
    await snapshotTextFiles(fixture.notesDirectory),
    fixture.baselineNotes,
    "External Delete must not persist changes to the Note Store.",
  );

  await writeFile(fixture.sourcePath, RECREATED_SOURCE, "utf8");
  await waitForWatcher();
  assert.deepEqual(
    await snapshotTextFiles(fixture.notesDirectory),
    fixture.baselineNotes,
    "Same-path recreation must not persist changes to the Note Store.",
  );
}

/**
 * Creates a File Note fixture anchored to the original source contents.
 *
 * @returns Stored File Note group used by the real filesystem regression.
 */
function createStoredSourceFile(): StoredSourceFile {
  return {
    source: {
      sourceHash: createSourceHash(ORIGINAL_SOURCE),
      programmingLanguage: "typescript",
    },
    fileNote: {
      id: "file",
      userNote: "Extension Host file note.",
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "user",
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    sectionNotes: [
      {
        id: "section:fixture:1-1",
        title: "Fixture declaration",
        range: {
          startLine: 1,
          endLine: 1,
        },
        anchorHash: createSourceHash(ORIGINAL_SOURCE.trimEnd()),
        userNote: "Extension Host section note.",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "user",
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
    ],
    lineNotes: [
      {
        id: "line:fixture:1",
        line: 1,
        anchorText: ORIGINAL_SOURCE.trimEnd(),
        userNote: "Extension Host line note.",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "user",
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
    ],
  };
}

/**
 * Captures every text file below a directory by stable relative path.
 *
 * @param directory - Root directory containing persistent Notes.
 * @param relativeDirectory - Current recursive directory relative to the root.
 * @returns Text contents keyed by normalized relative path.
 */
async function snapshotTextFiles(
  directory: string,
  relativeDirectory = "",
): Promise<Record<string, string>> {
  const currentDirectory = path.join(directory, relativeDirectory);
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  const snapshot: Record<string, string> = {};

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    const relativePath = path.join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      Object.assign(
        snapshot,
        await snapshotTextFiles(directory, relativePath),
      );
      continue;
    }

    snapshot[relativePath.split(path.sep).join("/")] = await readFile(
      path.join(directory, relativePath),
      "utf8",
    );
  }

  return snapshot;
}

/**
 * Waits for the real Watcher debounce and queued detection to settle.
 *
 * @returns Promise resolved after the test quiet period.
 */
async function waitForWatcher(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, WATCHER_SETTLE_MS);
  });
}
