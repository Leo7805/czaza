/**
 * Renders the file-level AI generation menu in the resource header.
 */

import { useEffect, useRef, useState } from "react";

/**
 * Renders a compact menu for choosing the scope of AI note generation.
 *
 * @param props - Component props.
 * @param props.actionLabel - Generate or Regenerate label for the menu trigger.
 * @param props.isRunning - Whether either generation action is running.
 * @param props.onGenerateFileSection - Generates file and section notes.
 * @param props.onGenerateAll - Generates file, section, and line notes.
 * @returns React element for the generation menu.
 *
 * @example
 * <AiGenerationMenu
 *   actionLabel="Generate"
 *   onGenerateFileSection={generateFileSection}
 *   onGenerateAll={generateAll}
 * />
 */
export function AiGenerationMenu({
  actionLabel,
  isRunning,
  onGenerateFileSection,
  onGenerateAll,
}: {
  actionLabel: "Generate" | "Regenerate";
  isRunning: boolean;
  onGenerateFileSection?: () => void;
  onGenerateAll?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const visibleActionLabel = isRunning
    ? actionLabel === "Generate"
      ? "Generating..."
      : "Regenerating..."
    : actionLabel;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isRunning) {
      setIsOpen(false);
    }
  }, [isRunning]);

  const runAction = (action: (() => void) | undefined): void => {
    setIsOpen(false);
    action?.();
  };

  return (
    <div className="ai-generation-menu" ref={rootRef}>
      <button
        className="resource-header__action"
        type="button"
        title={`${actionLabel} AI notes`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={isRunning}
        onClick={() => setIsOpen((current) => !current)}
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
        <svg
          className="ai-generation-menu__chevron"
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
        >
          <path fill="currentColor" d="m4.5 6 3.5 3.5L11.5 6H4.5Z" />
        </svg>
      </button>
      {isOpen ? (
        <div className="ai-generation-menu__popup" role="menu">
          <button
            className="ai-generation-menu__item"
            type="button"
            role="menuitem"
            onClick={() => runAction(onGenerateFileSection)}
          >
            File + Section Notes
          </button>
          <button
            className="ai-generation-menu__item"
            type="button"
            role="menuitem"
            onClick={() => runAction(onGenerateAll)}
          >
            All Notes
          </button>
        </div>
      ) : null}
    </div>
  );
}
