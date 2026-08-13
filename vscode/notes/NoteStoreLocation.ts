/**
 * Defines the physical scope of a Team or Personal Note Store.
 */

/** Selects the standard Team Store or one member's Personal Store. */
export type NoteStoreLocation =
  | { kind: "team" }
  | { kind: "personal"; memberId: string };

/** Default location preserving every existing Note Store call. */
export const TEAM_NOTE_STORE: NoteStoreLocation = { kind: "team" };

/**
 * Resolves the Store directory relative to the configured output directory.
 *
 * @param location - Team or Personal Store selection.
 * @returns Store-relative path segments.
 */
export function getNoteStorePathSegments(location: NoteStoreLocation): string[] {
  if (location.kind === "team") return ["notes", "team"];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(location.memberId)) {
    throw new Error("Invalid Personal Notes member ID.");
  }
  return ["notes", "personal", location.memberId];
}

/**
 * Creates the stable location component used by caches and write queues.
 *
 * @param location - Team or Personal Store selection.
 * @returns Stable location key.
 */
export function getNoteStoreLocationKey(location: NoteStoreLocation): string {
  return getNoteStorePathSegments(location).join("/");
}
