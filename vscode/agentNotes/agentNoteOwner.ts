/**
 * Resolves and verifies the human-readable owner of a Team or Personal Note Store.
 */

import type { NoteStoreLocation } from "@vscode/notes";
import { PersonalIdentityService } from "@vscode/personalNotes";
import type { AgentNoteOwner } from "./agentNoteTypes";

/** Minimal identity lookup used to verify Personal Notes ownership. */
export type AgentNoteIdentityLookup = Pick<PersonalIdentityService, "listMembers">;

/**
 * Resolves a verified display owner for one Note Store location.
 *
 * @param workspaceRoot - Absolute CZaza project root.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @param location - Exact Team or Personal Note Store location.
 * @param identities - Identity lookup used for Personal Notes.
 * @returns Verified owner shown before and after modification.
 */
export async function resolveAgentNoteOwner(
  workspaceRoot: string,
  outputDirectory: string,
  location: NoteStoreLocation,
  identities?: AgentNoteIdentityLookup,
): Promise<AgentNoteOwner> {
  if (location.kind === "team") return { kind: "team", label: "Team Notes" };
  if (!identities) throw new Error("Personal Notes require an identity lookup.");

  const member = (await identities.listMembers(workspaceRoot, outputDirectory))
    .find((candidate) => candidate.memberId === location.memberId);
  if (!member) throw new Error(`Personal Notes identity was not found: ${location.memberId}`);

  return {
    kind: "personal",
    memberId: member.memberId,
    displayName: member.displayName,
    label: `Personal Notes — ${member.displayName}`,
  };
}
