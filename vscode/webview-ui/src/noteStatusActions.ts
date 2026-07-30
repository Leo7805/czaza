/**
 * Decides which Note status actions are safe to expose in the WebView.
 */

import type { NoteStatus } from "./types";

/**
 * Reports whether the visible stale state may be confirmed from the context menu.
 *
 * Content staleness is independent from anchor review, so Location Review does
 * not disable this action.
 *
 * @param status - Effective status shown by the card.
 * @param _runtimeStatus - Optional Runtime State status retained for call-site compatibility.
 * @returns True when Clear stale may be selected.
 */
export function canClearContentStaleStatus(
  status: NoteStatus | undefined,
  _runtimeStatus: NoteStatus | undefined,
): boolean {
  return status?.content === "stale";
}
