import type { CZazaConfig } from "@shared/types/config";

/**
 * Default CZaza configuration.
 */
export const defaultConfig: CZazaConfig = {
  language: "zh-CN",
  outDir: ".czaza",
  include: ["src/**/*.{ts,tsx,js,jsx}"],
  exclude: ["node_modules", "dist", "build", ".git", ".czaza", "coverage"],
};
