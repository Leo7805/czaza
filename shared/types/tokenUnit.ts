import type { ExplanationBlock, Range } from "./common";

/**
 * A small explainable fragment inside a line.
 *
 * This is useful for explaining Tailwind classes, JSX props,
 * operators, keywords, method chains, or other small code fragments.
 */
export type TokenUnit = {
  /** Stable unique identifier. */
  id: string;

  /** The original text fragment. */
  text: string;

  /** Optional category of the token. */
  kind?:
    | "tailwind-class"
    | "css-class"
    | "jsx-prop"
    | "jsx-tag"
    | "operator"
    | "keyword"
    | "identifier"
    | "literal"
    | "other";

  /** Position inside the source file. */
  range?: Range;

  /** AI-generated explanation for this small fragment. */
  explanation: ExplanationBlock;
};
