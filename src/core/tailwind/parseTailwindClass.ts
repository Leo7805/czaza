import type { ParsedTailwindClass } from "../../types/types.ts";

/**
 * Parses a Tailwind class string into its modifiers and base class.
 * @param className
 * @returns ParsedTailwindClass object containing the original class, modifiers, and base class.
 *
 * @example
 * ```ts
 * parseTailwindClass("md:hover:bg-slate-100")
 *
 * // The result will be:
 * {
 *   original: "md:hover:bg-slate-100",
 *   modifiers: ["md", "hover"],
 *   baseClass: "bg-slate-100",
 * }
 * ```
 */
export function parseTailwindClass(className: string): ParsedTailwindClass {
  const parts = className.split(":");

  const modifiers = parts.slice(0, -1);
  const baseClass = parts[parts.length - 1];

  const dashIndex = baseClass.indexOf("-");

  if (dashIndex === -1) {
    return {
      original: className,
      modifiers,
      property: baseClass,
      value: null,
    };
  }

  return {
    original: className,
    modifiers,
    property: baseClass.slice(0, dashIndex),
    value: baseClass.slice(dashIndex + 1),
  };
}
