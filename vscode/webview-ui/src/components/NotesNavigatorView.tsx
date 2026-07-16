/**
 * Renders the initial Notes Navigator shell.
 *
 * The list data is intentionally not connected yet. Later iterations will
 * provide project File Notes and current-file Section/Line Notes here.
 */

import { useState } from "react";

import type { ResourceNotesViewModel } from "../types";

/** Navigator list categories. */
export type NotesNavigatorTab = "files" | "sections" | "lines";

/** Props for the Notes Navigator view. */
export type NotesNavigatorViewProps = {
  /** Current resource context used for the current-file heading. */
  notes: ResourceNotesViewModel;
};

/**
 * Renders the Files, Sections, and Lines navigator tabs.
 *
 * @param props - Current resource context.
 * @returns React element for the navigator mode.
 *
 * @example
 * <NotesNavigatorView notes={notes} />
 */
export function NotesNavigatorView({ notes }: NotesNavigatorViewProps) {
  const [activeTab, setActiveTab] = useState<NotesNavigatorTab>("files");
  const currentFile = notes.kind === "file" ? notes.relativePath : undefined;
  const heading = getNavigatorHeading(activeTab, currentFile);

  return (
    <section className="notes-navigator" aria-label="Notes Navigator">
      <div className="notes-navigator__tabs" role="tablist" aria-label="Note lists">
        <NavigatorTab
          activeTab={activeTab}
          tab="files"
          label="Files"
          onChange={setActiveTab}
        />
        <NavigatorTab
          activeTab={activeTab}
          tab="sections"
          label="Sections"
          onChange={setActiveTab}
        />
        <NavigatorTab
          activeTab={activeTab}
          tab="lines"
          label="Lines"
          onChange={setActiveTab}
        />
      </div>
      <div className="notes-navigator__content" role="tabpanel">
        <h1 className="notes-navigator__title">{heading}</h1>
        <p className="notes-navigator__empty">No notes loaded yet.</p>
      </div>
    </section>
  );
}

function NavigatorTab({
  activeTab,
  tab,
  label,
  onChange,
}: {
  activeTab: NotesNavigatorTab;
  tab: NotesNavigatorTab;
  label: string;
  onChange: (tab: NotesNavigatorTab) => void;
}) {
  return (
    <button
      className={activeTab === tab ? "notes-navigator__tab notes-navigator__tab--active" : "notes-navigator__tab"}
      type="button"
      role="tab"
      aria-selected={activeTab === tab}
      onClick={() => onChange(tab)}
    >
      {label}
    </button>
  );
}

/**
 * Builds the visible heading for one navigator list.
 *
 * @param tab - List category represented by the active tab.
 * @param currentFile - Root-relative current file path, when available.
 * @returns Scope-specific list heading.
 *
 * @example
 * getNavigatorHeading("sections", "src/index.ts");
 * // "Sections in current file: src/index.ts"
 */
export function getNavigatorHeading(
  tab: NotesNavigatorTab,
  currentFile: string | undefined,
): string {
  if (tab === "files") {
    return "Project File Notes";
  }

  if (!currentFile) {
    return tab === "sections" ? "Sections in current file" : "Lines in current file";
  }

  return tab === "sections"
    ? `Sections in current file: ${currentFile}`
    : `Lines in current file: ${currentFile}`;
}
