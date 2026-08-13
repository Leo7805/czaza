/**
 * Verifies stdin-driven Agent Notes CLI command routing and output behavior.
 */

import { describe, expect, it, vi } from "vitest";

import type { AgentNotesCliDependencies } from "@vscode/agentNotes/agentNotesCli";
import { runAgentNotesCli } from "@vscode/agentNotes/agentNotesCli";

describe("runAgentNotesCli", () => {
  it("returns the verified Notes space currently displayed by CZaza", async () => {
    const dependencies = createDependencies();
    const output = await runAgentNotesCli(
      "current",
      JSON.stringify({ workspaceRoot: "/workspace", outputDirectory: ".czaza" }),
      dependencies,
    );

    expect(JSON.parse(output)).toMatchObject({
      workspaceRoot: "/workspace",
      location: { kind: "personal", memberId: "leo" },
      owner: { label: "Personal Notes — Leo" },
    });
  });

  it("returns structured JSON for inspect", async () => {
    const dependencies = createDependencies();
    const output = await runAgentNotesCli("inspect", JSON.stringify({ location: { kind: "team" } }), dependencies);

    expect(JSON.parse(output)).toEqual({ owner: { kind: "team", label: "Team Notes" }, files: [], skipped: [] });
    expect(dependencies.inspect).toHaveBeenCalledOnce();
  });

  it("returns owner-aware JSON and token for confirm", async () => {
    const dependencies = createDependencies();
    const output = await runAgentNotesCli("confirm", JSON.stringify({ location: { kind: "personal", memberId: "leo" } }), dependencies);

    expect(JSON.parse(output)).toMatchObject({ owner: { label: "Personal Notes — Leo" }, confirmationToken: "sha256:plan" });
    expect(dependencies.confirm).toHaveBeenCalledOnce();
  });

  it("returns the readable per-file report for apply", async () => {
    const dependencies = createDependencies();
    const output = await runAgentNotesCli("apply", JSON.stringify({ confirmationToken: "sha256:plan" }), dependencies);

    expect(output).toBe("formatted report\n");
    expect(dependencies.apply).toHaveBeenCalledOnce();
    expect(dependencies.format).toHaveBeenCalledOnce();
  });

  it("rejects empty input, invalid JSON, and unknown commands", async () => {
    const dependencies = createDependencies();

    await expect(runAgentNotesCli("inspect", "", dependencies)).rejects.toThrow("requires a JSON object");
    await expect(runAgentNotesCli("inspect", "{", dependencies)).rejects.toThrow("invalid JSON");
    await expect(runAgentNotesCli("unknown", "{}", dependencies)).rejects.toThrow("Usage:");
  });
});

/** Creates deterministic command dependencies without filesystem writes. */
function createDependencies(): AgentNotesCliDependencies {
  return {
    inspect: vi.fn().mockResolvedValue({ owner: { kind: "team", label: "Team Notes" }, files: [], skipped: [] }),
    confirm: vi.fn().mockResolvedValue({ owner: { kind: "personal", memberId: "leo", displayName: "Leo", label: "Personal Notes — Leo" }, confirmationToken: "sha256:plan", message: "Confirm." }),
    apply: vi.fn().mockResolvedValue({ owner: { kind: "team", label: "Team Notes" }, files: [], summary: { filesChanged: 0, updated: 0, created: 0, skipped: 0, failed: 0 } }),
    format: vi.fn().mockReturnValue("formatted report"),
    identities: { listMembers: vi.fn().mockResolvedValue([{ memberId: "leo", displayName: "Leo" }]) },
    activeNotes: {
      load: vi.fn().mockResolvedValue({
        workspaceRoot: "/workspace",
        outputDirectory: ".czaza",
        location: { kind: "personal", memberId: "leo" },
        updatedAt: "2026-08-13T00:00:00.000Z",
      }),
    } as never,
  };
}
