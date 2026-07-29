/**
 * Runs one passive source consistency check against session-only Runtime Note State.
 */

import {
  refreshRuntimeNoteStateService,
  type RefreshRuntimeNoteStateInput,
  type RefreshRuntimeNoteStateResult,
} from "./refreshRuntimeNoteStateService";

/** Input for one passive Runtime Note consistency check. */
export type PassiveRuntimeNoteCheckInput = RefreshRuntimeNoteStateInput;

/** Result from one passive Runtime Note consistency check. */
export type PassiveRuntimeNoteCheckResult = RefreshRuntimeNoteStateResult;

/**
 * Checks one opened source snapshot and reconciles its Runtime Note State.
 *
 * @param input - Source snapshot, Note Store reader, registry, and observation time.
 * @returns Detection result and registry mutation.
 *
 * @example
 * const result = await passiveRuntimeNoteCheckService({
 *   document,
 *   notes,
 *   registry,
 *   now,
 * });
 */
export async function passiveRuntimeNoteCheckService(
  input: PassiveRuntimeNoteCheckInput,
): Promise<PassiveRuntimeNoteCheckResult> {
  return refreshRuntimeNoteStateService(input);
}
