/**
 * Types for structural code units extracted from source code.
 *
 * Code units are usually detected by the parser or AST layer.
 */

import type { ExplanationBlock, Range } from "./common";

/**
 * Supported structural code unit types.
 */
export type StructureUnitKind =
  | "component"
  | "function"
  | "hook"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "variable";

/**
 * A structural code unit extracted from source code.
 *
 * Examples include functions, React components, hooks, classes,
 * interfaces, types, enums, and top-level variables.
 */
export type BasicStructureUnit = {
  /** Stable unique identifier. */
  id: string;

  /** Structural type of the code unit. */
  kind: StructureUnitKind;

  /** Display name of the code unit. */
  name: string;

  /** Source code range covered by this unit. */
  range: Range;

  /** Original source code for this unit. */
  code: string;
};

/**
 * A code unit enriched with an AI-generated explanation.
 */
export type StructureUnit = BasicStructureUnit & {
  explanation: ExplanationBlock;
};
