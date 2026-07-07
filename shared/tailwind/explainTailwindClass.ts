import { parseTailwindClass } from "./parseTailwindClass";
import { explainTailwindToken } from "./explainTailwindToken";
import type { TailwindExplanation } from "@shared/types/types";

/**
 * Explains a Tailwind class by attaching notes to each parsed component.
 *
 * @example
 * ```ts
 * const result = explainTailwindClass("hover:bg-slate-100");
 *
 * // The result will be:
 * {
 *   original: "hover:bg-slate-100",
 *
 *   modifiers: [
 *     {
 *       token: "hover",
 *       note: {
 *         title: "hover",
 *         summary: "鼠标悬停状态.",
 *         detail: "只有鼠标移动到元素上时才会生效."
 *       }
 *     }
 *   ],
 *
 *   property: {
 *     token: "bg",
 *     note: {
 *       title: "bg",
 *       summary: "背景颜色.",
 *       detail: "设置元素的背景颜色."
 *     }
 *   },
 *
 *   value: {
 *     token: "slate-100",
 *     note: {
 *       title: "slate-100",
 *       summary: "Tailwind Slate 100.",
 *       detail: "一种非常浅的灰蓝色."
 *     }
 *   }
 * }
 * ```
 */
export function explainTailwindClass(className: string): TailwindExplanation {
  const parsed = parseTailwindClass(className);

  return {
    original: parsed.original,

    modifiers: parsed.modifiers.map((modifier) => ({
      token: modifier,
      note: explainTailwindToken(modifier),
    })),

    property: {
      token: parsed.property,
      note: explainTailwindToken(parsed.property),
    },

    value: parsed.value
      ? {
          token: parsed.value,
          note: explainTailwindToken(parsed.value),
        }
      : null,
  };
}
