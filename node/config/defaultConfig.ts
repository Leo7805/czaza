import type { CZazaConfig } from "@shared/types/config";
import { DEFAULT_SCAN_RULES } from "@shared/config/scanRules";

/**
 * Default CZaza configuration.
 */
export const defaultConfig: CZazaConfig = {
  language: "en",
  outDir: ".czaza",
  ai: {
    deepSeekApiKey: "",
  },
  scan: {
    maxDepth: 8,
    maxEntries: 5000,
    rules: {
      ignore: [...DEFAULT_SCAN_RULES.ignore],
      collapseOnly: [...DEFAULT_SCAN_RULES.collapseOnly],
    },
  },
};
