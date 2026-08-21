/**
 * Verifies local persistence and validation of the currently displayed Notes space.
 */

import path from "node:path";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { ActiveNotesSelectionRepository } from "@vscode/agentNotes/ActiveNotesSelectionRepository";

describe("ActiveNotesSelectionRepository", () => {
  it("stores and reads one workspace's current Notes selection", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "czaza-active-notes-"));
    const repository = new ActiveNotesSelectionRepository(directory);

    await repository.save(
      "/workspace",
      ".czaza",
      { kind: "personal", memberId: "leo" },
      "zh-CN",
    );

    expect(await repository.load("/workspace")).toMatchObject({
      workspaceRoot: path.resolve("/workspace"),
      outputDirectory: ".czaza",
      location: { kind: "personal", memberId: "leo" },
      responseLanguage: "zh-CN",
    });
  });

  it("defaults legacy selections without a response language to English", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "czaza-active-notes-legacy-"));
    const repository = new ActiveNotesSelectionRepository(directory);
    const normalizedRoot = path.resolve("/workspace").split(path.sep).join("/");
    const key = createHash("sha256").update(normalizedRoot).digest("hex");

    await writeFile(path.join(directory, `${key}.json`), JSON.stringify({
      workspaceRoot: "/workspace",
      outputDirectory: ".czaza",
      location: { kind: "team" },
      updatedAt: "2026-08-21T00:00:00.000Z",
    }), "utf8");

    expect(await repository.load("/workspace")).toMatchObject({
      responseLanguage: "en",
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
