/**
 * Calculates and applies bounded content-aware User Note editor heights.
 */

const MIN_NOTE_EDITOR_HEIGHT = 144;
const MAX_NOTE_EDITOR_HEIGHT = 360;
const MAX_VIEWPORT_RATIO = 0.5;

/**
 * Calculates an editor height from its content and current viewport.
 *
 * @param scrollHeight - Full textarea content height in pixels.
 * @param viewportHeight - Current WebView viewport height in pixels.
 * @returns Height clamped between the editor minimum and responsive maximum.
 */
export function calculateNoteEditorHeight(
  scrollHeight: number,
  viewportHeight: number,
): number {
  const responsiveMaximum = Math.max(
    MIN_NOTE_EDITOR_HEIGHT,
    Math.min(MAX_NOTE_EDITOR_HEIGHT, viewportHeight * MAX_VIEWPORT_RATIO),
  );

  return Math.min(
    Math.max(scrollHeight, MIN_NOTE_EDITOR_HEIGHT),
    responsiveMaximum,
  );
}

/**
 * Resizes one textarea to its content while preserving a bounded panel height.
 *
 * @param editor - User Note textarea to resize.
 * @param viewportHeight - Current WebView viewport height in pixels.
 * @returns Nothing.
 */
export function resizeNoteEditorToContent(
  editor: HTMLTextAreaElement,
  viewportHeight: number,
): void {
  editor.style.height = "auto";
  const contentHeight = editor.scrollHeight;
  const nextHeight = calculateNoteEditorHeight(contentHeight, viewportHeight);

  editor.style.height = `${nextHeight}px`;
  editor.style.overflowY = contentHeight > nextHeight ? "auto" : "hidden";
}
