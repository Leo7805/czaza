/**
 * Types for file-level code explanation.
 */

import type { ExplanationBlock } from "./common";

/**
 * File-level explanation.
 */
export type FileUnit = {
  /** Explanation for the whole source file. */
  explanation: ExplanationBlock;
};
