/** Exports automatic Note relocation services driven by source changes. */

export {
  classifySourceChange,
  classifySourceChangeBatch,
  classifySourceContentChange,
  type ClassifiedSourceChange,
  type ClassifiedSourceChangeBatch,
  type TextDocumentContentChange,
  type TextDocumentChangeInput,
} from "./classifySourceChangeService";
export {
  applySourceChangeBatch,
  type ApplySourceChangeBatchInput,
  type ApplySourceChangeBatchResult,
} from "./applySourceChangeBatchService";
export {
  applyDeterministicRelocation,
  applySourceSpliceToAnchors,
  type ApplyDeterministicRelocationInput,
  type ApplyDeterministicRelocationResult,
  type ApplySourceSpliceToAnchorsResult,
  type DeterministicRelocationEvent,
} from "./applyDeterministicRelocationService";
export {
  findOverlappingSourceChanges,
  hasSamePositionInsertions,
  isValidSourceChangeSplice,
  sortSourceChangesForApplication,
  type OverlappingSourceChangePair,
} from "./sourceChangeBatchAnalysis";
export {
  transformLineAnchor,
  transformSectionAnchor,
  type LineAnchorTransform,
  type SectionAnchorRange,
  type SectionAnchorTransform,
  type SourceChangeSplice,
} from "./sourceChangeAnchorTransform";
export { applySourceChangeToNotesService } from "./applySourceChangeToNotesService";
