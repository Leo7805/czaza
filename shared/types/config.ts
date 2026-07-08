/**
 * Configuration for CZaza.
 */
export type CZazaConfig = {
  /** Output language for generated explanations. */
  language: "zh-CN" | "en";

  /** Internal output directory used by CZaza. */
  outDir: string;

  /** Project scanning configuration. */
  scan: CZazaScanConfig;
};

export type CZazaScanConfig = {
  /** Maximum depth of directories to scan before stopping. */
  maxDepth: number;

  /** Maximum number of files and directories to scan before stopping. */
  maxEntries: number;

  /** Path rules used when building the Project Map. */
  rules: CZazaScanRules;
};

export type CZazaScanRules = {
  /** Paths that should be completely hidden from the Project Map. */
  ignore: string[];

  /** Paths that should be shown without scanning their internal files. */
  collapseOnly: string[];
};
