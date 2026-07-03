import { tailwindDict } from "../../data/tailwindTokens";

export function explainTailwindToken(token: string) {
  return tailwindDict[token] ?? null;
}
