/**
 * Verifies safe batched AI Note updates through the shared Note Store.
 */

import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { createFileNoteFromAiAnalysis } from "@shared/services/aiToDomainService";
import { createStoredSourceFile } from "@shared/services/domainToStoreService";
import { createSourceHash } from "@shared/utils/hashUtils";
import { applyAgentNoteUpdates } from "@vscode/agentNotes/applyAgentNoteUpdates";
import { WorkspaceNoteStore, WorkspaceNoteStoreRepository } from "@vscode/notes";

const outputDirectory = ".czaza";
const createdAt = "2026-08-13T00:00:00.000Z";
const updatedAt = "2026-08-13T01:00:00.000Z";
const sourceText = ["export function run() {", "  return true;", "}", ""].join("\n");

describe("applyAgentNoteUpdates", () => {
  it("updates AI content while preserving user content and saves once", async () => {
    const setup = await createTrackedWorkspace("update");
    const saveSourceFile = setup.notes.cache.saveSourceFile.bind(setup.notes.cache);
    let saveCount = 0;
    setup.notes.cache.saveSourceFile = async (...args) => {
      saveCount += 1;
      return saveSourceFile(...args);
    };

    const report = await applyAgentNoteUpdates({
      workspaceRoot: setup.workspaceRoot,
      outputDirectory,
      files: [{
        sourcePath: setup.sourcePath,
        expectedSourceHash: createSourceHash(sourceText),
        changes: [{
          action: "update",
          level: "file",
          noteId: "file",
          aiExplanation: { summary: "This file runs one task.", detail: "- run: Returns whether the task succeeded." },
          reason: "The function behavior changed.",
        }],
      }],
    }, setup.notes, () => updatedAt);

    const saved = await setup.notes.cache.getSourceFile(setup.workspaceRoot, outputDirectory, setup.sourcePath);
    expect(saveCount).toBe(1);
    expect(saved?.fileNote).toMatchObject({
      createdBy: "user",
      createdAt,
      updatedAt,
      userNote: "Keep this user note.",
      aiExplanation: { summary: "This file runs one task." },
    });
    expect(report.summary).toEqual({ filesChanged: 1, updated: 1, created: 0, skipped: 0, failed: 0 });
  });

  it("creates file, section, and line AI Notes with generated store fields", async () => {
    const setup = await createTrackedWorkspace("create", false);

    const report = await applyAgentNoteUpdates({
      workspaceRoot: setup.workspaceRoot,
      outputDirectory,
      files: [{
        sourcePath: setup.sourcePath,
        expectedSourceHash: createSourceHash(sourceText),
        changes: [
          { action: "create", level: "file", aiExplanation: { summary: "This file runs one task.", detail: "- run: Returns whether the task succeeded." }, reason: "The tracked file needs an overview." },
          { action: "create", level: "section", title: "Run task", range: { startLine: 1, endLine: 3 }, aiExplanation: { summary: "This function runs one task.", detail: "It returns a success value." }, reason: "The function is important." },
          { action: "create", level: "line", line: 2, aiExplanation: { summary: "This line reports success.", detail: "It returns true to the caller." }, reason: "The return value matters." },
        ],
      }],
    }, setup.notes, () => updatedAt);

    const saved = await setup.notes.cache.getSourceFile(setup.workspaceRoot, outputDirectory, setup.sourcePath);
    expect(saved?.fileNote).toMatchObject({ id: "file", createdBy: "ai", createdAt: updatedAt });
    expect(saved?.sectionNotes[0]).toMatchObject({ createdBy: "ai", range: { startLine: 1, endLine: 3 }, createdAt: updatedAt });
    expect(saved?.lineNotes[0]).toMatchObject({ id: "line:2", line: 2, anchorText: "  return true;", createdBy: "ai" });
    expect(report.summary).toEqual({ filesChanged: 1, updated: 0, created: 3, skipped: 0, failed: 0 });
  });

  it("rejects stale source hashes without writing", async () => {
    const setup = await createTrackedWorkspace("hash");
    const original = await setup.notes.cache.getSourceFile(setup.workspaceRoot, outputDirectory, setup.sourcePath);

    const report = await applyAgentNoteUpdates({
      workspaceRoot: setup.workspaceRoot,
      outputDirectory,
      files: [{
        sourcePath: setup.sourcePath,
        expectedSourceHash: "sha256:old",
        changes: [{ action: "update", level: "file", noteId: "file", aiExplanation: { summary: "New summary.", detail: "New detail." }, reason: "Requested update." }],
      }],
    }, setup.notes, () => updatedAt);

    expect(await setup.notes.cache.getSourceFile(setup.workspaceRoot, outputDirectory, setup.sourcePath)).toEqual(original);
    expect(report.summary.failed).toBe(1);
    expect(report.files[0]?.changes[0]?.reason).toBe("Source hash changed after inspection.");
  });

  it("reports unchanged content and invalid requests without writing", async () => {
    const setup = await createTrackedWorkspace("invalid");
    const existing = await setup.notes.cache.getSourceFile(setup.workspaceRoot, outputDirectory, setup.sourcePath);
    const explanation = existing?.fileNote?.aiExplanation;

    if (!explanation) throw new Error("Expected seeded AI explanation.");

    const report = await applyAgentNoteUpdates({
      workspaceRoot: setup.workspaceRoot,
      outputDirectory,
      files: [{
        sourcePath: setup.sourcePath,
        expectedSourceHash: createSourceHash(sourceText),
        changes: [
          { action: "update", level: "file", noteId: "file", aiExplanation: explanation, reason: "No semantic change." },
          { action: "update", level: "section", noteId: "missing", aiExplanation: { summary: "Missing section.", detail: "This should fail." }, reason: "Requested update." },
          { action: "create", level: "line", line: 99, aiExplanation: { summary: "Invalid line.", detail: "This should fail." }, reason: "Requested creation." },
        ],
      }],
    }, setup.notes, () => updatedAt);

    expect(report.summary).toEqual({ filesChanged: 0, updated: 0, created: 0, skipped: 1, failed: 2 });
    expect(await setup.notes.cache.getSourceFile(setup.workspaceRoot, outputDirectory, setup.sourcePath)).toEqual(existing);
  });
});

/** Creates an isolated tracked source file and Team Note Store. */
async function createTrackedWorkspace(name: string, withFileNote = true): Promise<{
  workspaceRoot: string;
  sourcePath: string;
  notes: WorkspaceNoteStore;
}> {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), `czaza-agent-apply-${name}-`));
  const sourcePath = "src/run.ts";
  const absolutePath = path.join(workspaceRoot, sourcePath);
  const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => "fixed001"));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, sourceText, "utf8");
  await notes.cache.saveSourceFile(workspaceRoot, outputDirectory, sourcePath, createStoredSourceFile({
    sourceCode: sourceText,
    ...(withFileNote ? {
      fileNote: {
        ...createFileNoteFromAiAnalysis({ summary: "This file runs a task.", detail: "It returns a result." }),
        createdBy: "user" as const,
        userNote: "Keep this user note.",
      },
    } : {}),
    now: createdAt,
  }), createdAt);
  return { workspaceRoot, sourcePath, notes };
}
