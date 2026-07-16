/** Renders the initial Files, Sections, and Lines navigator shell. */

import { useState } from "react";

import type { NavigatorNotesViewModel } from "../types";
import { getVsCodeApi } from "../vscodeApi";
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

  const openNavigatorResource = (relativePath: string): void => {
    getVsCodeApi()?.postMessage({
      type: "openNavigatorResource",
      relativePath,
    });
  };
  const openNavigatorSection = (section: {
    id: string;
    startLine: number;
    endLine: number;
  }): void => {
    getVsCodeApi()?.postMessage({
      type: "openNavigatorSection",
      sectionId: section.id,
      startLine: section.startLine,
      endLine: section.endLine,
    });
  };
  const openNavigatorLine = (line: number): void => {
    getVsCodeApi()?.postMessage({
      type: "openNavigatorLine",
      line,
    });
  };

  return (
    <ol className="notes-navigator__list">
      {items.map((item, index) => {
        if (tab === "files" && "relativePath" in item) {
          return (
            <li
              className="notes-navigator__item notes-navigator__item--file"
              key={item.relativePath}
              role="button"
              tabIndex={0}
              onClick={() => openNavigatorResource(item.relativePath)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openNavigatorResource(item.relativePath);
                }
              }}
            >
              <span className="notes-navigator__index">{index + 1}</span>
              <ResourceIcon resourceKind={item.resourceKind} />
              <span className="notes-navigator__item-main">
                <strong>{item.name}</strong>
                <span>{item.preview}</span>
              </span>
            </li>
          );
        }

        if (tab === "sections" && "startLine" in item) {
          return (
            <li
              className="notes-navigator__item"
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => openNavigatorSection(item)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openNavigatorSection(item);
                }
              }}
            >
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
            <li
              className="notes-navigator__item"
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => openNavigatorLine(item.line)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openNavigatorLine(item.line);
                }
              }}
            >
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

function ResourceIcon({ resourceKind }: { resourceKind: "file" | "directory" }) {
  if (resourceKind === "directory") {
    return (
      <svg
        className="notes-navigator__resource-icon notes-navigator__resource-icon--directory"
        viewBox="0 0 16 16"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M1.5 4.25A1.75 1.75 0 0 1 3.25 2.5h3.1l1.35 1.4h5.05a1.75 1.75 0 0 1 1.75 1.75v6.1a1.75 1.75 0 0 1-1.75 1.75H3.25a1.75 1.75 0 0 1-1.75-1.75v-7.5Z" />
        <path d="M2.75 6.25h10.5v5.45a.55.55 0 0 1-.55.55H3.3a.55.55 0 0 1-.55-.55V6.25Z" />
      </svg>
    );
  }

  return (
    <svg
      className="notes-navigator__resource-icon notes-navigator__resource-icon--file"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 2.75A1.75 1.75 0 0 1 4.75 1h4.7L13 4.55v8.7A1.75 1.75 0 0 1 11.25 15h-6.5A1.75 1.75 0 0 1 3 13.25V2.75Z" />
      <path d="M9.25 1.7v2.85c0 .66.54 1.2 1.2 1.2h2.85" />
      <path d="M5.25 8.25h5.5M5.25 10.5h5.5" />
    </svg>
  );
}
