/**
 * Provides mutually exclusive selection rules for the Notes space menu.
 */

import type { NotesSpaceMenuState } from "../types";

/** Returns whether one Personal identity is the currently active Note Store. */
export function isPersonalIdentitySelected(
  state: NotesSpaceMenuState,
  memberId: string,
): boolean {
  return state.scope === "personal" && state.currentMemberId === memberId;
}
