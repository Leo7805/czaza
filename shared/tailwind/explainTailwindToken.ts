import { tailwindDict } from "@shared/data/tailwindTokens";

export function explainTailwindToken(token: string) {
  return tailwindDict[token] ?? null;
}
