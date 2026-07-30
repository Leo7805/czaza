/**
 * Exposes session-only Runtime Note State models and registry services.
 */

export { RuntimeNoteStateRegistry } from "./RuntimeNoteStateRegistry";
export {
  RuntimeNoteStateDetectionController,
  type AllFileNotesDetectionResult,
  type CurrentFileNotesDetectionResult,
  type ResourceNotesDetectionResult,
} from "./RuntimeNoteStateDetectionController";
export { applyRuntimeStateToResourceNotes } from "./applyRuntimeStateToResourceNotesService";
export { applyRuntimeStateToNavigatorNotes } from "./applyRuntimeStateToNavigatorNotesService";
export {
  confirmRuntimeNoteStaleStatusService,
  type ConfirmRuntimeNoteStaleStatusInput,
  type ConfirmRuntimeNoteStaleStatusResult,
} from "./confirmRuntimeNoteStaleStatusService";
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
  refreshBinaryRuntimeNoteStateService,
  type RefreshBinaryRuntimeNoteStateInput,
  type RefreshBinaryRuntimeNoteStateResult,
} from "./refreshBinaryRuntimeNoteStateService";
export {
  refreshMissingRuntimeNoteStateService,
  type RefreshMissingRuntimeNoteStateResult,
} from "./refreshMissingRuntimeNoteStateService";
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
