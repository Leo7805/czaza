/**
 * Reconciles read-only source detection results with the Runtime Note State Registry.
 */

import {
  detectRuntimeNoteStateService,
  type DetectRuntimeNoteStateInput,
  type DetectRuntimeNoteStateResult,
} from "./detectRuntimeNoteStateService";
import { RuntimeNoteStateRegistry } from "./RuntimeNoteStateRegistry";

/** Registry mutation performed after one Runtime Note detection. */
export type RuntimeNoteRegistryChange = "set" | "deleted" | "none";

/** Input for detecting and reconciling one source resource's Runtime Note State. */
export type RefreshRuntimeNoteStateInput = DetectRuntimeNoteStateInput & {
  /** Session-only registry that owns affected resource state. */
  registry: RuntimeNoteStateRegistry;

  /** Optional final check that rejects an obsolete asynchronous detection result. */
  canApply?: () => boolean;
};

/** Detection result augmented with the performed registry mutation. */
export type RefreshRuntimeNoteStateResult = DetectRuntimeNoteStateResult & {
  registryChange: RuntimeNoteRegistryChange;
};

/**
 * Refreshes one source resource's Runtime Note State without persistent writes.
 *
 * Affected resources replace their registry state. Current or untracked
 * resources clear old state. Gate-rejected resources leave the registry alone.
 *
 * @param input - Document, Note Store reader, observation time, and registry.
 * @returns Detection result and the registry mutation that was performed.
 *
 * @example
 * const result = await refreshRuntimeNoteStateService({
 *   document,
 *   notes,
 *   registry,
 *   now,
 * });
 */
export async function refreshRuntimeNoteStateService(
  input: RefreshRuntimeNoteStateInput,
): Promise<RefreshRuntimeNoteStateResult> {
  const result = await detectRuntimeNoteStateService(input);

  if (input.canApply?.() === false) {
    return {
      ...result,
      registryChange: "none",
    };
  }

  if (result.kind === "ignored") {
    return {
      ...result,
      registryChange: "none",
    };
  }

  if (result.kind === "affected") {
    input.registry.setState(result.state);
    return {
      ...result,
      registryChange: "set",
    };
  }

  const deleted = input.registry.deleteState(result.coordinates);
  return {
    ...result,
    registryChange: deleted ? "deleted" : "none",
  };
}
