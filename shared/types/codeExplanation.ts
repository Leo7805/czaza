/**
 * The final complete explanation result for one source file.
 */

import type { StructureUnit } from "./structureUnit";
import type { LineUnit } from "./lineUnit";
import type { FileUnit } from "./fileUnit";
import type { Language } from "./common";
import type { SemanticUnit } from "./semanticUnit";

/**
 * Complete explanation result returned by the AI.
 */
export type CodeExplanation = {
  /** Programming language of the source file. */
  language: Language;

  /** File-level explanation. */
  file: FileUnit;

  /** Parser-detected code units enriched with AI explanations. */
  codeUnits: StructureUnit[];

  /** AI-generated semantic sections. */
  semanticUnits: SemanticUnit[];

  /** Optional line-by-line explanations. */
  lines?: LineUnit[];

  /** Optional note added by the user. */
  userNote?: string;
};
