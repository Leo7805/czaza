/**
 * Configuration for CZaza.
 */
export type CZazaConfig = {
  /** Output language for generated explanations. */
  language: "zh-CN" | "en";

  /** Internal output directory used by CZaza. */
  outDir: string;

  /** File glob patterns to include during scanning. */
  include: string[];

  /** File or directory glob patterns to exclude during scanning. */
  exclude: string[];
};
