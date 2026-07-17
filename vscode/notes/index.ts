/**
 * Public exports for workspace note store APIs.
 */

export { WorkspaceNoteStore } from "./WorkspaceNoteStore";
export { WorkspaceNoteStoreRepository } from "./WorkspaceNoteStoreRepository";
export {
  WorkspaceNoteResourceManager,
  type MarkSourceFileEntryDeletedResult,
  type MoveSourceFileEntryResult,
} from "./workspaceNoteStoreResources";
export type {
  SourceFileNoteCheckResult,
  SourceFileNoteStatusApplyResult,
} from "./WorkspaceNoteStoreTypes";
