/** Exports automatic Note relocation services driven by source changes. */

export {
  classifySourceChange,
  classifySourceContentChange,
  type ClassifiedSourceChange,
} from "./classifySourceChangeService";
export {
  applyDeterministicRelocation,
  type ApplyDeterministicRelocationResult,
} from "./applyDeterministicRelocationService";
export { applySourceChangeToNotesService } from "./applySourceChangeToNotesService";
