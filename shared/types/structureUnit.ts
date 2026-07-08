/**
 * Types for structure units extracted from source code.
 *
 * Structure units are usually detected by the parser or AST layer.
 */

import type { ExplanationBlock, Range } from "./common";

/**
 * Supported structure unit types.
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
 * A structure unit extracted from source code.
 *
 * Examples include functions, React components, hooks, classes,
 * interfaces, types, enums, and top-level variables.
 */
export type BasicStructureUnit = {
  /** Stable unique identifier. */
  id: string;

  /** Structural type of the structure unit. */
  kind: StructureUnitKind;

  /** Display name of the structure unit. */
  name: string;

  /** Source code range covered by this unit. */
  range: Range;

  /** Original source code for this unit. */
  code: string;
};

/**
 * A structure unit enriched with an AI-generated explanation.
 */
export type StructureUnit = BasicStructureUnit & {
  /** AI-generated explanation for this structure unit. */
  explanation: ExplanationBlock;
};
