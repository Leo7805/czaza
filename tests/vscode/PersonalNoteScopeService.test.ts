/**
 * Tests local Team and Personal Note Store scope selection.
 */

import type * as vscode from "vscode";
import { describe, expect, it, vi } from "vitest";

import { PersonalNoteScopeService } from "@vscode/personalNotes/PersonalNoteScopeService";

describe("PersonalNoteScopeService", () => {
  it("defaults to Team and resolves a bound Personal member", async () => {
    const state = new Map<string, unknown>();
    const identities = {
      getCurrentIdentity: vi.fn().mockResolvedValue({ memberId: "leo-12345678" }),
    };
    const activeNotes = { save: vi.fn() };
    const service = new PersonalNoteScopeService(createMemento(state), identities as never, activeNotes as never);

    expect(service.getScope("/workspace")).toBe("team");
    expect(await service.resolveLocation("/workspace", ".czaza")).toEqual({ kind: "team" });

    await service.setScope("/workspace", "personal");
    expect(await service.resolveLocation("/workspace", ".czaza")).toEqual({
      kind: "personal",
      memberId: "leo-12345678",
    });
    expect(activeNotes.save).toHaveBeenLastCalledWith(
      "/workspace",
      ".czaza",
      { kind: "personal", memberId: "leo-12345678" },
    );
  });

  it("falls back to Team when the Personal identity is unavailable", async () => {
    const state = new Map<string, unknown>();
    const service = new PersonalNoteScopeService(
      createMemento(state),
      { getCurrentIdentity: vi.fn().mockResolvedValue(undefined) } as never,
      { save: vi.fn() } as never,
    );
    await service.setScope("/workspace", "personal");
    expect(await service.resolveLocation("/workspace", ".czaza")).toEqual({ kind: "team" });
    expect(service.getScope("/workspace")).toBe("team");
  });
});

/** Creates an in-memory VS Code Memento. */
function createMemento(state: Map<string, unknown>): vscode.Memento {
  return {
    keys: () => [...state.keys()],
    get: <T>(key: string, defaultValue?: T) => (state.has(key) ? state.get(key) : defaultValue) as T,
    update: async (key: string, value: unknown) => { state.set(key, value); },
  };
}
