/**
 * Renders the selected resource title and root-relative path.
 */

import { useEffect, useRef, useState } from "react";

import { Tooltip } from "./Tooltip";

/**
 * Renders a shared resource header for file and directory notes.
 *
 * @param props - Component props.
 * @param props.kind - Resource kind.
 * @param props.name - Display name.
 * @param props.relativePath - Root-relative path.
 * @param props.showAction - Whether to show the header action button.
 * @param props.actionLabel - Label for the AI action button.
 * @param props.isActionRunning - Whether AI generation is currently running.
 * @param props.onAction - Callback invoked when the AI action is selected.
 * @returns React element for the resource header.
 *
 * @example
 * <ResourceHeader
 *   kind="file"
 *   name="index.ts"
 *   relativePath="src/index.ts"
 *   showAction
 *   actionLabel="Generate"
 * />
 */
export function ResourceHeader({
  kind,
  name,
  relativePath,
  showAction = true,
  actionLabel = "Generate",
  isActionRunning = false,
  onAction,
}: {
  kind: "file" | "directory";
  name: string;
  relativePath: string;
  showAction?: boolean;
  actionLabel?: "Generate" | "Regenerate";
  isActionRunning?: boolean;
  onAction?: () => void;
}) {
  const startedAtRef = useRef<number | undefined>(undefined);
  const [timer, setTimer] = useState({
    visible: isActionRunning,
    seconds: 0,
  });
  const visibleActionLabel = isActionRunning
    ? actionLabel === "Generate"
      ? "Generating..."
      : "Regenerating..."
    : actionLabel;

  useEffect(() => {
    if (isActionRunning) {
      const startedAt = Date.now();
      startedAtRef.current = startedAt;
      setTimer({ visible: true, seconds: 0 });

      const intervalId = window.setInterval(() => {
        setTimer({
          visible: true,
          seconds: Math.floor((Date.now() - startedAt) / 1000),
        });
      }, 1000);

      return () => window.clearInterval(intervalId);
    }

    const startedAt = startedAtRef.current;

    if (startedAt === undefined) {
      return;
    }

    startedAtRef.current = undefined;
    setTimer({
      visible: true,
      seconds: Math.floor((Date.now() - startedAt) / 1000),
    });

    const timeoutId = window.setTimeout(() => {
      setTimer((current) => ({ ...current, visible: false }));
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [isActionRunning]);

  return (
    <header className="resource-header">
      <div className="resource-header__content">
        <div className="resource-header__title-row">
          <Tooltip content={relativePath}>
            <h1 className="resource-header__title">{name}</h1>
          </Tooltip>
          <span className="resource-header__kind">{kind}</span>
        </div>
        {showAction ? (
          <div className="resource-header__actions">
            {timer.visible ? (
              <span className="resource-header__timer" aria-live="polite">
                {timer.seconds}s
              </span>
            ) : null}
            <button
              className="resource-header__action"
              type="button"
              title={`${actionLabel} AI notes`}
              disabled={isActionRunning}
              onClick={onAction}
            >
            <svg
              className="resource-header__action-icon"
              viewBox="0 0 16 16"
              aria-hidden="true"
              focusable="false"
            >
              <path
                fill="currentColor"
                d="M13.5 2.8v3.7H9.8l1.4-1.4A4.6 4.6 0 0 0 3.4 8.4H2.2a5.8 5.8 0 0 1 9.8-4.2l1.5-1.4Zm-1.1 4.8h1.2a5.8 5.8 0 0 1-9.8 4.2l-1.5 1.4V9.5H6l-1.4 1.4a4.6 4.6 0 0 0 7.8-3.3Z"
              />
            </svg>
              <span>{visibleActionLabel}</span>
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
