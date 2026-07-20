/** Lazy-loaded Emoji Mart popover used by note editors. */

import { useEffect, useRef } from "react";

export type EmojiPickerPosition = { x: number; y: number };

export function EmojiPickerPopover({
  position,
  onSelect,
  onClose,
}: {
  position: EmojiPickerPosition;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let picker: HTMLElement | undefined;

    void Promise.all([import("emoji-mart"), import("@emoji-mart/data")]).then(
      ([{ Picker }, dataModule]) => {
        if (disposed || !hostRef.current) {
          return;
        }

        const pickerElement = new Picker({
          data: dataModule.default,
          dynamicWidth: true,
          locale: "zh",
          previewPosition: "none",
          theme: document.body.classList.contains("vscode-light") ? "light" : "dark",
          onClickOutside: onClose,
          onEmojiSelect: (emoji: { native?: string }) => {
            if (emoji.native) {
              onSelect(emoji.native);
            }
          },
        }) as unknown as HTMLElement;
        picker = pickerElement;
        hostRef.current.append(pickerElement);
      },
      () => onClose(),
    );

    return () => {
      disposed = true;
      picker?.remove();
    };
  }, [onClose, onSelect]);

  return (
    <div
      ref={hostRef}
      className="emoji-picker-popover"
      style={{ left: position.x, top: position.y }}
      role="dialog"
      aria-label="Insert emoji"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    />
  );
}
