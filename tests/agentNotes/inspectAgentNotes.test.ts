/**
 * Verifies safe read-only inspection of current source files and Team Notes.
 */

import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { createFileNoteFromAiAnalysis } from "@shared/services/aiToDomainService";
import { createStoredSourceFile } from "@shared/services/domainToStoreService";
import { createSourceHash } from "@shared/utils/hashUtils";
import { inspectAgentNotes } from "@vscode/agentNotes/inspectAgentNotes";
import { WorkspaceNoteStore, WorkspaceNoteStoreRepository } from "@vscode/notes";

const outputDirectory = ".czaza";
const now = "2026-08-13T00:00:00.000Z";

describe("inspectAgentNotes", () => {
  it("returns current source text, hashes, and existing notes", async () => {
    const workspaceRoot = await createWorkspace("tracked");
    const sourcePath = "src/value.ts";
    const storedText = "export const value = 1;\n";
    const currentText = "export const value = 2;\n";
    const notes = createNotes();

    await writeSource(workspaceRoot, sourcePath, storedText);
    const sourceFile = createStoredSourceFile({
      sourceCode: storedText,
      fileNote: createFileNoteFromAiAnalysis({
        summary: "Exports a value.",
        detail: "The file exports one numeric constant.",
      }),
      now,
    });
    await notes.cache.saveSourceFile(
      workspaceRoot,
      outputDirectory,
      sourcePath,
      sourceFile,
      now,
    );
    await writeSource(workspaceRoot, sourcePath, currentText);

    const result = await inspectAgentNotes(
      { workspaceRoot, outputDirectory, location: { kind: "team" }, sourcePaths: ["src/./value.ts"] },
      notes,
    );

    expect(result.skipped).toEqual([]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({
      sourcePath,
      sourceText: currentText,
      sourceHash: createSourceHash(currentText),
      storedSourceHash: createSourceHash(storedText),
      registeredInNotes: true,
    });
    expect(result.files[0]?.notes.file?.aiExplanation?.summary).toBe("Exports a value.");
  });

  it("returns new source files with empty Notes and still reports missing sources", async () => {
    const workspaceRoot = await createWorkspace("skips");
    const notes = createNotes();

    await writeSource(workspaceRoot, "src/untracked.ts", "export {};\n");
    await notes.cache.saveSourceFile(
      workspaceRoot,
      outputDirectory,
      "src/tracked.ts",
      createStoredSourceFile({ sourceCode: "export {};\n", now }),
      now,
    );

    const result = await inspectAgentNotes(
      {
        workspaceRoot,
        outputDirectory,
        location: { kind: "team" },
        sourcePaths: ["src/untracked.ts", "src/missing.ts"],
      },
      notes,
    );

    expect(result.files).toEqual([{
      sourcePath: "src/untracked.ts",
      sourceText: "export {};\n",
      sourceHash: createSourceHash("export {};\n"),
      registeredInNotes: false,
      notes: { sections: [], lines: [] },
    }]);
    expect(result.skipped).toEqual([{ sourcePath: "src/missing.ts", reason: "sourceMissing" }]);
  });

  it("rejects paths outside the workspace and inside the Note Store", async () => {
    const workspaceRoot = await createWorkspace("paths");
    const notes = createNotes();

    const result = await inspectAgentNotes(
      {
        workspaceRoot,
        outputDirectory,
        location: { kind: "team" },
        sourcePaths: ["../outside.ts", ".czaza/notes/team/index.json"],
      },
      notes,
    );

    expect(result.files).toEqual([]);
    expect(result.skipped).toEqual([
      { sourcePath: "../outside.ts", reason: "outsideWorkspace" },
      { sourcePath: ".czaza/notes/team/index.json", reason: "outsideWorkspace" },
    ]);
  });

  it("distinguishes an invalid Note Store from an untracked source", async () => {
    const workspaceRoot = await createWorkspace("invalid-store");
    const sourcePath = "src/value.ts";

    await writeSource(workspaceRoot, sourcePath, "export const value = 1;\n");

    const result = await inspectAgentNotes(
      { workspaceRoot, outputDirectory, location: { kind: "team" }, sourcePaths: [sourcePath] },
      createNotes(),
    );

    expect(result.files).toEqual([]);
    expect(result.skipped).toEqual([{ sourcePath, reason: "noteStoreInvalid" }]);
  });
});

/** Creates an isolated workspace directory for one test. */
async function createWorkspace(name: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `czaza-agent-inspect-${name}-`));
}

/** Creates a Note Store with deterministic note-file identifiers. */
function createNotes(): WorkspaceNoteStore {
  return new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => "fixed001"));
}

/** Writes one source file below an isolated workspace. */
async function writeSource(
  workspaceRoot: string,
  sourcePath: string,
  sourceText: string,
): Promise<void> {
  const absolutePath = path.join(workspaceRoot, sourcePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, sourceText, "utf8");
}
