/**
 * Verifies local persistence and validation of the currently displayed Notes space.
 */

import path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { ActiveNotesSelectionRepository } from "@vscode/agentNotes/ActiveNotesSelectionRepository";

describe("ActiveNotesSelectionRepository", () => {
  it("stores and reads one workspace's current Notes selection", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "czaza-active-notes-"));
    const repository = new ActiveNotesSelectionRepository(directory);

    await repository.save("/workspace", ".czaza", { kind: "personal", memberId: "leo" });

    expect(await repository.load("/workspace")).toMatchObject({
      workspaceRoot: path.resolve("/workspace"),
      outputDirectory: ".czaza",
      location: { kind: "personal", memberId: "leo" },
    });
  });

  it("returns undefined for missing or invalid local state", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "czaza-active-notes-invalid-"));
    const repository = new ActiveNotesSelectionRepository(directory);
    await writeFile(path.join(directory, "unrelated.json"), "{}", "utf8");

    expect(await repository.load("/workspace")).toBeUndefined();
  });

  it("does not lose the selection when two saves race on the same workspace", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "czaza-active-notes-concurrent-"));
    const repository = new ActiveNotesSelectionRepository(directory);

    await Promise.all([
      repository.save("/workspace", ".czaza", { kind: "team" }),
      repository.save("/workspace", ".czaza", { kind: "personal", memberId: "leo" }),
    ]);

    const loaded = await repository.load("/workspace");
    expect(loaded).not.toBeUndefined();
    expect(["team", "personal"]).toContain(loaded?.location.kind);
  });
});
