/**
 * Exposes session-only Runtime Note State models and registry services.
 */

export { RuntimeNoteStateRegistry } from "./RuntimeNoteStateRegistry";
export { applyRuntimeStateToResourceNotes } from "./applyRuntimeStateToResourceNotesService";
export {
  detectRuntimeNoteStateService,
  type DetectRuntimeNoteStateInput,
  type DetectRuntimeNoteStateResult,
  type RuntimeNoteDetectionDocument,
} from "./detectRuntimeNoteStateService";
export {
  refreshRuntimeNoteStateService,
  type RefreshRuntimeNoteStateInput,
  type RefreshRuntimeNoteStateResult,
  type RuntimeNoteRegistryChange,
} from "./refreshRuntimeNoteStateService";
export {
  passiveRuntimeNoteCheckService,
  type PassiveRuntimeNoteCheckInput,
  type PassiveRuntimeNoteCheckResult,
} from "./passiveRuntimeNoteCheckService";
export type {
  RuntimeFileNoteChange,
  RuntimeLineNoteChange,
  RuntimeNoteIssue,
  RuntimeNoteState,
  RuntimeNoteStateChange,
  RuntimeNoteStateCoordinates,
  RuntimeNoteStateDisposable,
  RuntimeNoteStateListener,
  RuntimeNoteStateReason,
  RuntimeNoteStateScope,
  RuntimeNoteTargetChange,
  RuntimeSectionNoteChange,
  RuntimeSectionRange,
} from "./runtimeNoteState";
