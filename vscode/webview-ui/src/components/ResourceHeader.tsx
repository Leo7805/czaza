/**
 * Renders the selected resource title and root-relative path.
 */

import { useEffect, useRef, useState } from "react";

import { AiGenerationMenu } from "./AiGenerationMenu";
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
 * @param props.isAnyActionRunning - Whether any AI action is currently running.
 * @param props.onGenerateFileSection - Generates file and section notes.
 * @param props.onGenerateAll - Generates file, section, and line notes.
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
  isAnyActionRunning = false,
  onGenerateFileSection,
  onGenerateAll,
}: {
  kind: "file" | "binary" | "directory";
  name: string;
  relativePath: string;
  showAction?: boolean;
  actionLabel?: "Generate" | "Regenerate";
  isActionRunning?: boolean;
  isAnyActionRunning?: boolean;
  onGenerateFileSection?: () => void;
  onGenerateAll?: () => void;
}) {
  const startedAtRef = useRef<number | undefined>(undefined);
  const [timer, setTimer] = useState({
    visible: isAnyActionRunning,
    seconds: 0,
  });
  useEffect(() => {
    if (isAnyActionRunning) {
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
  }, [isAnyActionRunning]);

  return (
    <header className="resource-header">
      <div className="resource-header__content">
        <div className="resource-header__title-row">
          <Tooltip content={relativePath}>
            <h1 className="resource-header__title">{name}</h1>
          </Tooltip>
          <span className="resource-header__kind">
            {kind === "binary" ? "Binary File" : kind}
          </span>
        </div>
        {showAction ? (
          <div className="resource-header__actions">
            {timer.visible ? (
              <span className="resource-header__timer" aria-live="polite">
                {timer.seconds}s
              </span>
            ) : null}
            <AiGenerationMenu
              actionLabel={actionLabel}
              isRunning={isActionRunning}
              isDisabled={isAnyActionRunning && !isActionRunning}
              onGenerateFileSection={onGenerateFileSection}
              onGenerateAll={onGenerateAll}
            />
          </div>
        ) : null}
      </div>
    </header>
  );
}
