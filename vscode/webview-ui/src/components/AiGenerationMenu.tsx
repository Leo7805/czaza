/**
 * Renders the file-level AI generation menu in the resource header.
 */

import { useEffect, useRef, useState } from "react";

export type GenerationScope = "fileSection" | "all" | "currentLine" | "nearbyLines";

/** Menu option used by a scoped AI generation control. */
export type GenerationScopeOption = {
  /** Stable scope value sent to the callback. */
  scope: GenerationScope;
  /** Visible option label. */
  label: string;
};

/**
 * Renders a compact menu for choosing the scope of AI note generation.
 *
 * @param props - Component props.
 * @param props.actionLabel - Generate or Regenerate label for the menu trigger.
 * @param props.isRunning - Whether either generation action is running.
 * @param props.isDisabled - Whether another AI action is running.
 * @param props.onGenerateFileSection - Generates file and section notes.
 * @param props.onGenerateAll - Generates file, section, and line notes.
 * @param props.scopeOptions - Optional custom scope options for another note level.
 * @param props.defaultScope - Initially selected scope for custom options.
 * @param props.onGenerateScope - Callback used by custom scope options.
 * @param props.popupPlacement - Whether the scope menu opens below or above the trigger.
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
  isDisabled = false,
  onGenerateFileSection,
  onGenerateAll,
  scopeOptions,
  defaultScope = "fileSection",
  onGenerateScope,
  popupPlacement = "below",
}: {
  actionLabel: "Generate" | "Regenerate";
  isRunning: boolean;
  isDisabled?: boolean;
  onGenerateFileSection?: () => void;
  onGenerateAll?: () => void;
  scopeOptions?: readonly GenerationScopeOption[];
  defaultScope?: GenerationScope;
  onGenerateScope?: (scope: GenerationScope) => void;
  popupPlacement?: "below" | "above";
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const options = scopeOptions ?? [
    { scope: "fileSection" as const, label: "File + Section Notes" },
    { scope: "all" as const, label: "All Notes" },
  ];
  const [selectedScope, setSelectedScope] = useState<GenerationScope>(defaultScope);
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

  useEffect(() => {
    setSelectedScope(defaultScope);
  }, [defaultScope]);

  const runAction = (action: (() => void) | undefined): void => {
    setIsOpen(false);
    action?.();
  };

  const runSelectedAction = (): void => {
    if (onGenerateScope) {
      runAction(() => onGenerateScope(selectedScope));
      return;
    }

    runAction(selectedScope === "all" ? onGenerateAll : onGenerateFileSection);
  };

  const selectScope = (scope: GenerationScope): void => {
    setSelectedScope(scope);
    setIsOpen(false);
  };

  return (
    <div className="ai-generation-menu" ref={rootRef}>
      <button
        className="resource-header__action ai-generation-menu__main"
        type="button"
        title={`${actionLabel} AI notes`}
        disabled={isRunning || isDisabled}
        onClick={runSelectedAction}
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
      <button
        className="resource-header__action ai-generation-menu__arrow"
        type="button"
        title="Choose AI note generation scope"
        aria-label="Choose AI note generation scope"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={isRunning || isDisabled}
        onClick={() => setIsOpen((current) => !current)}
      >
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
        <div
          className={`ai-generation-menu__popup ai-generation-menu__popup--${popupPlacement}`}
          role="menu"
        >
          <button
            className="ai-generation-menu__item"
            type="button"
            role="menuitemradio"
            aria-checked={selectedScope === options[0]?.scope}
            onClick={() => selectScope(options[0]?.scope ?? defaultScope)}
          >
            <ScopeCheck isSelected={selectedScope === options[0]?.scope} />
            <span>{options[0]?.label}</span>
          </button>
          {options.slice(1).map((option) => (
            <button
              className="ai-generation-menu__item"
              type="button"
              role="menuitemradio"
              aria-checked={selectedScope === option.scope}
              onClick={() => selectScope(option.scope)}
              key={option.scope}
            >
              <ScopeCheck isSelected={selectedScope === option.scope} />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ScopeCheck({ isSelected }: { isSelected: boolean }) {
  return (
    <span className="ai-generation-menu__check" aria-hidden="true">
      {isSelected ? "✓" : ""}
    </span>
  );
}
