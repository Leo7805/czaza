/**
 * Decides which Note status actions are safe to expose in the WebView.
 */

import type { NoteStatus } from "./types";

/**
 * Reports whether the visible stale state may be confirmed from the context menu.
 *
 * Persistent stale content remains confirmable during migration. Runtime stale
 * content is confirmable only while its anchor remains confirmed.
 *
 * @param status - Effective status shown by the card.
 * @param runtimeStatus - Optional Runtime State status that produced the overlay.
 * @returns True when Clear stale may be selected.
 */
export function canClearContentStaleStatus(
  status: NoteStatus | undefined,
  runtimeStatus: NoteStatus | undefined,
): boolean {
  if (status?.content !== "stale") {
    return false;
  }

  return !runtimeStatus || (
    runtimeStatus.content === "stale" &&
    runtimeStatus.anchor === "confirmed"
  );
}
