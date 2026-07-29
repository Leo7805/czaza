/**
 * Exposes session-only Runtime Note State models and registry services.
 */

export { RuntimeNoteStateRegistry } from "./RuntimeNoteStateRegistry";
export {
  detectRuntimeNoteStateService,
  type DetectRuntimeNoteStateInput,
  type DetectRuntimeNoteStateResult,
  type RuntimeNoteDetectionDocument,
} from "./detectRuntimeNoteStateService";
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
