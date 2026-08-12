/**
 * Tests filesystem persistence for Personal Notes identities and member Stores.
 */

import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { createEmailIdentityHash } from "@vscode/personalNotes/gitIdentityService";
import {
  getPersonalIdentityIndexPath,
  getPersonalMemberStorePath,
  PersonalIdentityRepository,
} from "@vscode/personalNotes/PersonalIdentityRepository";

describe("PersonalIdentityRepository", () => {
  let root: string;
  const outputDirectory = ".czaza";

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "czaza-personal-identity-"));
  });

  it("persists a valid root identity index", async () => {
    const repository = new PersonalIdentityRepository();
    const identityHash = createEmailIdentityHash("leo@example.com");
    const index = {
      schemaVersion: 1 as const,
      updatedAt: "2026-08-13T00:00:00.000Z",
      members: {
        "leo-12345678": {
          memberId: "leo-12345678",
          displayName: "Leo",
          identityHash,
        },
      },
    };
    await repository.saveIndex(root, outputDirectory, index);
    expect(await repository.loadIndex(root, outputDirectory)).toEqual(index);
    expect(await readFile(getPersonalIdentityIndexPath(root, outputDirectory), "utf-8"))
      .toContain('"displayName": "Leo"');
  });

  it("creates a standard empty Store and never overwrites it", async () => {
    const repository = new PersonalIdentityRepository();
    await repository.createMemberStore(root, outputDirectory, "leo-12345678", "2026-08-13T00:00:00.000Z");
    const raw = await readFile(
      path.join(getPersonalMemberStorePath(root, outputDirectory, "leo-12345678"), "index.json"),
      "utf-8",
    );
    expect(JSON.parse(raw)).toMatchObject({ schemaVersion: 2, files: {} });
    await expect(repository.createMemberStore(
      root,
      outputDirectory,
      "leo-12345678",
      "2026-08-13T00:00:00.000Z",
    )).rejects.toThrow("already exists");
  });
});
