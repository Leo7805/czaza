/**
 * Tests Personal Notes identity creation, matching, and local workspace binding.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type * as vscode from "vscode";
import { beforeEach, describe, expect, it } from "vitest";

import { PersonalIdentityService } from "@vscode/personalNotes/PersonalIdentityService";

describe("PersonalIdentityService", () => {
  let root: string;
  let state: Map<string, unknown>;
  let service: PersonalIdentityService;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "czaza-personal-service-"));
    state = new Map();
    service = new PersonalIdentityService(createMemento(state));
  });

  it("creates, matches, and binds a Personal Notes identity", async () => {
    const member = await service.createIdentity(root, ".czaza", {
      displayName: "Leo",
      email: "Leo@Example.com",
    });
    expect(member.memberId).toMatch(/^leo-[a-f0-9]{8}$/);
    expect(await service.findByEmail(root, ".czaza", "leo@example.com")).toEqual(member);
    await service.bindCurrentIdentity(root, member.memberId);
    expect(await service.getCurrentIdentity(root, ".czaza")).toMatchObject(member);
  });

  it("rejects a duplicate normalized-email identity", async () => {
    await service.createIdentity(root, ".czaza", { displayName: "Leo", email: "leo@example.com" });
    await expect(service.createIdentity(root, ".czaza", {
      displayName: "Leo Again",
      email: " LEO@example.com ",
    })).rejects.toThrow("already uses this email hash");
  });
});

/** Creates an in-memory VS Code Memento test double. */
function createMemento(state: Map<string, unknown>): vscode.Memento {
  return {
    keys: () => [...state.keys()],
    get: <T>(key: string, defaultValue?: T) => (state.has(key) ? state.get(key) : defaultValue) as T,
    update: async (key: string, value: unknown) => { state.set(key, value); },
  };
}
