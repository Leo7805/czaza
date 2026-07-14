import type { ReactNode } from "react";

/**
 * Renders a small VS Code-style hover tooltip around inline content.
 *
 * @param props - Component props.
 * @param props.content - Tooltip text shown on hover or keyboard focus.
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
  children,
}: {
  content: string;
  children: ReactNode;
}) {
  return (
    <span className="tooltip" tabIndex={0}>
      {children}
      <span className="tooltip__content" role="tooltip">
        {content}
      </span>
    </span>
  );
}
