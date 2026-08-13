/**
 * Creates owner-aware confirmation text and a fingerprint for an Agent Note update plan.
 */

import { createSourceHash } from "@shared/utils/hashUtils";
import type { AgentNoteIdentityLookup } from "./agentNoteOwner";
import { resolveAgentNoteOwner } from "./agentNoteOwner";
import type {
  AgentNoteOwner,
  AgentNoteUpdatePlan,
} from "./agentNoteTypes";

/** Confirmation details that must be shown before applying a plan. */
export type AgentNoteUpdateConfirmation = {
  owner: AgentNoteOwner;
  confirmationToken: string;
  message: string;
};

/**
 * Creates confirmation text and a token bound to the exact owner and plan.
 *
 * @param plan - Complete update plan awaiting user confirmation.
 * @param identities - Identity lookup required for Personal Notes.
 * @returns Owner, confirmation message, and plan fingerprint.
 */
export async function createAgentNoteUpdateConfirmation(
  plan: AgentNoteUpdatePlan,
  identities?: AgentNoteIdentityLookup,
): Promise<AgentNoteUpdateConfirmation> {
  const owner = await resolveAgentNoteOwner(
    plan.workspaceRoot,
    plan.outputDirectory,
    plan.location,
    identities,
  );
  const updated = plan.files.flatMap((file) => file.changes)
    .filter((change) => change.action === "update").length;
  const created = plan.files.flatMap((file) => file.changes)
    .filter((change) => change.action === "create").length;
  const message = [
    "Ready to modify Notes",
    `Current Notes: ${owner.label}`,
    `Files involved: ${plan.files.length}`,
    `Notes to update: ${updated}`,
    `Notes to create: ${created}`,
    "Confirm before continuing.",
  ].join("\n");

  return { owner, confirmationToken: createAgentNoteConfirmationToken(plan), message };
}

/**
 * Creates a deterministic fingerprint for an exact update plan and Notes location.
 *
 * @param plan - Update plan whose contents must remain unchanged after confirmation.
 * @returns SHA-256 fingerprint used by the apply function.
 */
export function createAgentNoteConfirmationToken(plan: AgentNoteUpdatePlan): string {
  return createSourceHash(JSON.stringify(plan));
}
