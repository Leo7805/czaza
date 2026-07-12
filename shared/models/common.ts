/**
 * Common source-code types shared across model layers.
 */

/**
 * A one-based inclusive line range within a source file.
 */
export type LineRange = {
  /** One-based inclusive start line. */
  startLine: number;

  /** One-based inclusive end line. */
  endLine: number;
};

/**
 * Common identity and location fields for a meaningful code section.
 */
export type SectionDefinition = {
  /** Human-readable title describing the code section. */
  title: string;

  /** Optional category of the code section. */
  kind?: string;

  /** One-based inclusive source range covered by the section. */
  range: LineRange;
};
