/**
 * Types for line-by-line code explanations.
 */

import type { ExplanationBlock } from "./common";

import type { TokenUnit } from "./tokenUnit";

/**
 * Explanation for a single source line.
 */
export type LineUnit = {
  /** Source line number, 1-based. */
  lineNumber: number;

  /** Original source code on this line. */
  code: string;

  /** AI-generated explanation for this line. */
  explanation: ExplanationBlock;

  /** Optional token-level explanations. */
  tokenUnits?: TokenUnit[];
};
