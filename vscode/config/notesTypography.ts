/** Builds trusted CSS variables for the note typography settings. */

import type { CzazaSettings, NotesFontFamily } from "./czazaSettings";

const FONT_FAMILY_CSS: Record<NotesFontFamily, string> = {
  editor: "var(--vscode-editor-font-family, monospace)",
  ui: "var(--vscode-font-family, sans-serif)",
  monospace: "monospace",
};

/** Returns a style block that can be injected into either notes webview. */
export function getNotesTypographyStyle(settings: CzazaSettings): string {
  const fontSize =
    settings.notes.fontSize === 0
      ? "var(--vscode-editor-font-size, 13px)"
      : `${settings.notes.fontSize}px`;

  return `<style>:root{--czaza-notes-font-family:${FONT_FAMILY_CSS[settings.notes.fontFamily]};--czaza-notes-font-size:${fontSize};}</style>`;
}
