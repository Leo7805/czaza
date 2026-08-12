/**
 * Public exports for workspace note store APIs.
 */

export { WorkspaceNoteStore } from "./WorkspaceNoteStore";
export { WorkspaceNoteStoreRepository } from "./WorkspaceNoteStoreRepository";
export { TEAM_NOTE_STORE, type NoteStoreLocation } from "./NoteStoreLocation";
export {
  WorkspaceNoteResourceManager,
  type MarkSourceFileEntryDeletedResult,
  type MoveSourceFileEntryResult,
} from "./workspaceNoteStoreResources";
export type {
  SourceFileNoteCheckResult,
  SourceFileNoteStatusApplyResult,
} from "./WorkspaceNoteStoreTypes";
