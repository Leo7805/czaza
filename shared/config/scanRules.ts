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
  ignore: [
    // Version control
    ".git/",
    ".svn/",
    ".hg/",

    // IDE
    ".idea/",
    ".vscode/",

    // Build cache
    ".turbo/",
    ".expo/",
    ".vercel/",
    ".netlify/",

    // Build outputs
    "coverage/",
    ".nyc_output/",

    // Python
    "__pycache__/",
    ".pytest_cache/",
    ".venv/",
    "venv/",

    // Java / Kotlin
    ".gradle/",

    // .NET
    "bin/",
    "obj/",

    // Misc
    ".DS_Store",
  ],

  /**
   * Paths that should be shown as a single collapsed item,
   * without scanning their internal files.
   */
  collapseOnly: [
    "node_modules/",
    ".next/",
    ".cache/",
    "dist/",
    "build/",
    "target/",
    "public/",
    "assets/",
    "images/",
    "icons/",
    "fonts/",
    "tests/",
  ],
} as const;
