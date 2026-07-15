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
  children,
}: {
  content: string;
  variant?: "default" | "section";
  children: ReactNode;
}) {
  return (
    <span
      className={variant === "section" ? "tooltip tooltip--section" : "tooltip"}
      tabIndex={0}
    >
      {children}
      <span className="tooltip__content" role="tooltip">
        {content}
      </span>
    </span>
  );
}
