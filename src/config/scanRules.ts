/**
 * Defines default rules for building the Project Map.
 *
 * Some generated or dependency directories are still shown in the map
 * because knowing why they exist is useful, but their internal files are
 * not scanned to avoid noisy or endless output.
 */
export const DEFAULT_SCAN_RULES = {
  /**
   * Paths that should be completely hidden from the Project Map.
   */
  ignore: [".git/**", ".DS_Store", "*.log"],

  /**
   * Paths that should be shown as a single collapsed item,
   * without scanning their internal files.
   */
  collapseOnly: [
    "node_modules/**",
    ".next/**",
    ".cache/**",
    "dist/**",
    "build/**",
    "coverage/**",
    "public/**",
    "assets/**",
    "images/**",
    "icons/**",
    "fonts/**",
  ],
} as const;
