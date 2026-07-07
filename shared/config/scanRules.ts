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
    "**/.git",
    "**/.git/**",
    "**/.svn",
    "**/.svn/**",
    "**/.hg",
    "**/.hg/**",

    // Dependencies
    "**/node_modules",
    "**/node_modules/**",

    // IDE
    "**/.idea",
    "**/.idea/**",
    "**/.vscode",
    "**/.vscode/**",

    // Build cache
    "**/.turbo",
    "**/.turbo/**",
    "**/.cache",
    "**/.cache/**",
    "**/.next",
    "**/.next/**",
    "**/.expo",
    "**/.expo/**",
    "**/.vercel",
    "**/.vercel/**",
    "**/.netlify",
    "**/.netlify/**",

    // Build outputs
    "**/dist",
    "**/dist/**",
    "**/build",
    "**/build/**",
    "**/coverage",
    "**/coverage/**",
    "**/.nyc_output",
    "**/.nyc_output/**",

    // Python
    "**/__pycache__",
    "**/__pycache__/**",
    "**/.pytest_cache",
    "**/.pytest_cache/**",
    "**/.venv",
    "**/.venv/**",
    "**/venv",
    "**/venv/**",

    // Java / Kotlin
    "**/.gradle",
    "**/.gradle/**",
    "**/target",
    "**/target/**",

    // .NET
    "**/bin",
    "**/bin/**",
    "**/obj",
    "**/obj/**",

    // Misc
    "**/.DS_Store",
  ],

  /**
   * Paths that should be shown as a single collapsed item,
   * without scanning their internal files.
   */
  collapseOnly: [
    "**/node_modules/**",
    "**/.next/**",
    "**/.cache/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/public/**",
    "**/assets/**",
    "**/images/**",
    "**/icons/**",
    "**/fonts/**",
    "**/tests/**",
  ],
} as const;
