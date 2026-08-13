/**
 * Verifies owner-aware confirmation messages and update-plan fingerprints.
 */

import { describe, expect, it } from "vitest";

import type { AgentNoteUpdatePlan } from "@vscode/agentNotes/agentNoteTypes";
import {
  createAgentNoteConfirmationToken,
  createAgentNoteUpdateConfirmation,
} from "@vscode/agentNotes/createAgentNoteUpdateConfirmation";

describe("createAgentNoteUpdateConfirmation", () => {
  it("shows Team Notes and planned change counts", async () => {
    const plan = createPlan({ kind: "team" });
    const confirmation = await createAgentNoteUpdateConfirmation(plan);

    expect(confirmation.owner).toEqual({ kind: "team", label: "Team Notes" });
    expect(confirmation.message).toContain("Current Notes: Team Notes");
    expect(confirmation.message).toContain("Notes to update: 1");
    expect(confirmation.message).toContain("Notes to create: 1");
    expect(confirmation.confirmationToken).toBe(createAgentNoteConfirmationToken(plan));
  });

  it("shows the verified Personal Notes display name", async () => {
    const plan = createPlan({ kind: "personal", memberId: "leo-12345678" });
    const identities = { listMembers: async () => [{ memberId: "leo-12345678", displayName: "Leo", identityHash: "a".repeat(64) }] };
    const confirmation = await createAgentNoteUpdateConfirmation(plan, identities);

    expect(confirmation.message).toContain("Current Notes: Personal Notes — Leo");
  });

  it("changes the token when the plan changes", () => {
    const plan = createPlan({ kind: "team" });
    const changed = { ...plan, files: plan.files.map((file) => ({ ...file, expectedSourceHash: "sha256:changed" })) };

    expect(createAgentNoteConfirmationToken(changed)).not.toBe(createAgentNoteConfirmationToken(plan));
  });
});

/** Creates one small update plan for confirmation tests. */
function createPlan(location: AgentNoteUpdatePlan["location"]): AgentNoteUpdatePlan {
  return {
    workspaceRoot: "/workspace/project",
    outputDirectory: ".czaza",
    location,
    files: [{
      sourcePath: "src/value.ts",
      expectedSourceHash: "sha256:source",
      changes: [
        { action: "update", level: "file", noteId: "file", aiExplanation: { summary: "This file exports a value.", detail: "- getValue: Returns the value." }, reason: "Behavior changed." },
        { action: "create", level: "line", line: 1, aiExplanation: { summary: "This line exports the value.", detail: "It makes the value public." }, reason: "The export matters." },
      ],
    }],
  };
}
