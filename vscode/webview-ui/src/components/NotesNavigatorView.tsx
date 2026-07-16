/** Renders the initial Files, Sections, and Lines navigator shell. */

import { useState } from "react";

import type { NavigatorNotesViewModel } from "../types";
import { Tooltip } from "./Tooltip";

/** Navigator list categories. */
export type NotesNavigatorTab = "files" | "sections" | "lines";

/** Props for the Notes Navigator view. */
export type NotesNavigatorViewProps = {
  /** Complete list data loaded by the extension host. */
  navigatorNotes: NavigatorNotesViewModel;
};

/** Maps each navigator list to its corresponding detail-card accent. */
const navigatorAccentClass: Record<NotesNavigatorTab, string> = {
  files: "notes-navigator__heading--file",
  sections: "notes-navigator__heading--section",
  lines: "notes-navigator__heading--line",
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
export function NotesNavigatorView({ navigatorNotes }: NotesNavigatorViewProps) {
  const [activeTab, setActiveTab] = useState<NotesNavigatorTab>("files");
  const currentFile = navigatorNotes.kind === "resource" ? navigatorNotes.currentFile : undefined;
  const projectRootName =
    navigatorNotes.kind === "resource" ? navigatorNotes.projectRootName : "Project";
  const heading = getNavigatorHeading(activeTab);
  const badge = getNavigatorBadge(activeTab, currentFile, projectRootName);

  return (
    <section className="notes-navigator" aria-label="Notes Navigator">
      <div className="notes-navigator__tabs" role="tablist" aria-label="Note lists">
        <NavigatorTab activeTab={activeTab} tab="files" label="Files" onChange={setActiveTab} />
        <NavigatorTab
          activeTab={activeTab}
          tab="sections"
          label="Sections"
          onChange={setActiveTab}
        />
        <NavigatorTab activeTab={activeTab} tab="lines" label="Lines" onChange={setActiveTab} />
      </div>
      <div className="notes-navigator__content" role="tabpanel">
        <div className={`notes-navigator__heading ${navigatorAccentClass[activeTab]}`}>
          <h1 className="notes-navigator__title">{heading}</h1>
          <Tooltip content={badge}>
            <span className="notes-navigator__badge">{badge}</span>
          </Tooltip>
        </div>
        <NavigatorList notes={navigatorNotes} tab={activeTab} />
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
      className={
        activeTab === tab
          ? "notes-navigator__tab notes-navigator__tab--active"
          : "notes-navigator__tab"
      }
      type="button"
      role="tab"
      aria-selected={activeTab === tab}
      onClick={() => onChange(tab)}
    >
      {label}
    </button>
  );
}

/** Builds the visible navigator heading without appending its scope badge. */
export function getNavigatorHeading(tab: NotesNavigatorTab): string {
  return tab === "files"
    ? "Project File Notes"
    : tab === "sections"
      ? "Sections in current file"
      : "Lines in current file";
}

/** Builds the scope badge shown next to a navigator heading. */
export function getNavigatorBadge(
  tab: NotesNavigatorTab,
  currentFile: string | undefined,
  projectRootName: string,
): string {
  if (tab === "files") {
    return projectRootName;
  }

  return currentFile ?? "No current file";
}

function NavigatorList({
  notes,
  tab,
}: {
  notes: NavigatorNotesViewModel;
  tab: NotesNavigatorTab;
}) {
  if (notes.kind !== "resource") {
    return <p className="notes-navigator__empty">No notes loaded yet.</p>;
  }

  const items = tab === "files" ? notes.files : tab === "sections" ? notes.sections : notes.lines;

  if (items.length === 0) {
    const label = tab === "files" ? "file" : tab === "sections" ? "section" : "line";
    return <p className="notes-navigator__empty">No {label} notes found.</p>;
  }

  return (
    <ol className="notes-navigator__list">
      {items.map((item, index) => {
        if (tab === "files" && "relativePath" in item) {
          return (
            <li className="notes-navigator__item" key={item.relativePath}>
              <span className="notes-navigator__index">{index + 1}</span>
              <span className="notes-navigator__item-main">
                <strong>{item.name}</strong>
                <span>{item.preview}</span>
              </span>
            </li>
          );
        }

        if (tab === "sections" && "startLine" in item) {
          return (
            <li className="notes-navigator__item" key={item.id}>
              <span className="notes-navigator__index">{index + 1}</span>
              <span className="notes-navigator__item-main">
                <strong>{item.title || "Untitled section"}</strong>
                <span>{item.preview}</span>
              </span>
              <span className="notes-navigator__item-location">
                L{item.startLine}-{item.endLine}
              </span>
            </li>
          );
        }

        if ("line" in item) {
          return (
            <li className="notes-navigator__item" key={item.id}>
              <span className="notes-navigator__index">{index + 1}</span>
              <span className="notes-navigator__item-main">
                <strong>Line {item.line}</strong>
                <span>{item.preview}</span>
              </span>
            </li>
          );
        }

        return null;
      })}
    </ol>
  );
}
