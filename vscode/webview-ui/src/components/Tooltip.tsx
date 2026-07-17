/**
 * Provides a reusable VS Code-style tooltip for compact webview content.
 */

import type { ReactNode } from "react";

/**
 * Renders a small VS Code-style hover tooltip around inline content.
 *
 * @param props - Component props.
 * @param props.content - Tooltip text shown on hover or keyboard focus.
 * @param props.variant - Optional contextual color treatment.
 * @param props.align - Horizontal alignment of the tooltip content.
 * @param props.children - Inline content that owns the tooltip.
 * @returns React element with hover tooltip behavior.
 *
 * @example
 * <Tooltip content="src/components/App.tsx">
 *   <span>App.tsx</span>
 * </Tooltip>
 */
export function Tooltip({
  content,
  variant = "default",
  align = "start",
  children,
}: {
  content: string;
  variant?: "default" | "section";
  align?: "start" | "end";
  children: ReactNode;
}) {
  const className = [
    "tooltip",
    variant === "section" ? "tooltip--section" : "",
    align === "end" ? "tooltip--end" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={className} tabIndex={0}>
      {children}
      <span className="tooltip__content" role="tooltip">
        {content}
      </span>
    </span>
  );
}
