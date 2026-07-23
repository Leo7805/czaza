/** Renders the initial Files, Sections, and Lines navigator shell. */

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  NavigatorFileItem,
  NavigatorLineItem,
  NavigatorNotesViewModel,
  NavigatorSectionItem,
  NoteStatus,
} from "../types";
import { getVsCodeApi } from "../vscodeApi";
import {
  NavigatorItemContextMenu,
  type NavigatorItemContextMenuItem,
  type NavigatorItemContextMenuPosition,
} from "./NavigatorItemContextMenu";
import { NoteStatusBadges } from "./NoteStatusBadges";
import { NoticeModal } from "./NoticeModal";
import { RelocateFileNoteModal } from "./RelocateFileNoteModal";
import { Tooltip } from "./Tooltip";
import {
  defaultNavigatorSort,
  filterAndSortNavigatorItems,
  matchesGlobalSearch,
  type NavigatorSortField,
  type NavigatorSortState,
} from "./navigatorListUtils";

/** Navigator list categories. */
export type NotesNavigatorTab = "files" | "sections" | "lines";

type FileContextMenuState = {
  position: NavigatorItemContextMenuPosition;
  item: NavigatorFileItem;
};

type SectionContextMenuState = {
  position: NavigatorItemContextMenuPosition;
  item: NavigatorSectionItem;
};

type LineContextMenuState = {
  position: NavigatorItemContextMenuPosition;
  item: NavigatorLineItem;
};

type RelocateModalState = {
  fromRelativePath: string;
};

type MarkOrphanedModalState = {
  relativePath: string;
};

type DeleteNotesModalState = {
  relativePath: string;
};

type DeleteSectionModalState = {
  sectionId: string;
  title: string;
};

type DeleteLineModalState = {
  lineId: string;
  line: number;
};

type RelocatedFileNote = {
  fromRelativePath: string;
  toRelativePath: string;
  sequence: number;
};

/** Props for the Notes Navigator view. */
export type NotesNavigatorViewProps = {
  /** Complete list data loaded by the extension host. */
  navigatorNotes: NavigatorNotesViewModel;

  /** Last successfully relocated file note, if any. */
  relocatedFileNote?: RelocatedFileNote;

  /** Active editor path suggested by the extension host for relocation. */
  relocateTargetPath?: string;
};

/** Maps each navigator list to its corresponding detail-card accent. */
const navigatorAccentClass: Record<NotesNavigatorTab, string> = {
  files: "notes-navigator__heading--file",
  sections: "notes-navigator__heading--section",
  lines: "notes-navigator__heading--line",
};

type NavigatorItemKind = "file" | "section" | "line";

/**
 * Builds the row classes shared by all Navigator lists.
 *
 * @param kind - Navigator list item kind.
 * @param options - Current state modifiers for the row.
 * @returns Space-separated class names.
 *
 * @example
 * getNavigatorItemClassName("file", { isCurrent: true })
 */
export function getNavigatorItemClassName(
  kind: NavigatorItemKind,
  options: { isCurrent?: boolean; isOrphaned?: boolean } = {},
): string {
  return [
    "notes-navigator__item",
    `notes-navigator__item--${kind}`,
    options.isCurrent ? "notes-navigator__item--current" : undefined,
    options.isOrphaned ? "notes-navigator__item--orphaned" : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Renders the Files, Sections, and Lines navigator tabs.
 *
 * @param props - Current resource context.
 * @returns React element for the navigator mode.
 *
 * @example
 * <NotesNavigatorView notes={notes} />
 */
export function NotesNavigatorView({
  navigatorNotes,
  relocatedFileNote,
  relocateTargetPath,
}: NotesNavigatorViewProps) {
  const [activeTab, setActiveTab] = useState<NotesNavigatorTab>("files");
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
  const [filters, setFilters] = useState<Record<NotesNavigatorTab, string>>({
    files: "",
    sections: "",
    lines: "",
  });
  const [sorts, setSorts] = useState<Record<NotesNavigatorTab, NavigatorSortState>>(
    defaultNavigatorSort,
  );
  const currentFile = navigatorNotes.kind === "resource" ? navigatorNotes.currentFile : undefined;
  const projectRootName =
    navigatorNotes.kind === "resource" ? navigatorNotes.projectRootName : "Project";
  const heading = getNavigatorHeading(activeTab);
  const badge = getNavigatorBadge(activeTab, currentFile, projectRootName);
  const matchCounts = getGlobalMatchCounts(navigatorNotes, globalQuery);
  const activeSort = sorts[activeTab];
  const defaultSort = defaultNavigatorSort[activeTab];
  const hasHiddenControlState =
    Boolean(filters[activeTab].trim()) ||
    activeSort.field !== defaultSort.field ||
    activeSort.direction !== defaultSort.direction;

  return (
    <section className="notes-navigator" aria-label="Notes Navigator">
      <div className="notes-navigator__tabs">
        <div className="notes-navigator__tab-list" role="tablist" aria-label="Note lists">
          <NavigatorTab activeTab={activeTab} tab="files" label="Files" count={globalQuery ? matchCounts.files : undefined} onChange={setActiveTab} />
          <NavigatorTab activeTab={activeTab} tab="sections" label="Sections" count={globalQuery ? matchCounts.sections : undefined} onChange={setActiveTab} />
          <NavigatorTab activeTab={activeTab} tab="lines" label="Lines" count={globalQuery ? matchCounts.lines : undefined} onChange={setActiveTab} />
        </div>
        {globalSearchOpen ? (
          <div className="notes-navigator__global-search">
            <input
              autoFocus
              aria-label="Search all notes"
              placeholder="Search all notes…"
              type="search"
              value={globalQuery}
              onChange={(event) => setGlobalQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setGlobalQuery("");
                  setGlobalSearchOpen(false);
                }
              }}
            />
            <button
              className="notes-navigator__search-close"
              aria-label="Close search"
              title="Close search"
              type="button"
              onClick={() => {
                setGlobalQuery("");
                setGlobalSearchOpen(false);
              }}
            >
              <CloseIcon />
            </button>
          </div>
        ) : (
          <button
            className={globalQuery ? "notes-navigator__search-toggle notes-navigator__search-toggle--active" : "notes-navigator__search-toggle"}
            aria-label="Search all notes"
            title="Search all notes"
            type="button"
            onClick={() => setGlobalSearchOpen(true)}
          >
            <SearchIcon />
          </button>
        )}
      </div>
      <div className="notes-navigator__content" role="tabpanel">
        <div className={`notes-navigator__heading ${navigatorAccentClass[activeTab]}`}>
          <div className="notes-navigator__heading-main">
            <h1 className="notes-navigator__title">{heading}</h1>
            <Tooltip content={badge}>
              <span className="notes-navigator__badge">{badge}</span>
            </Tooltip>
            <button
              aria-controls="notes-navigator-list-controls"
              aria-expanded={controlsExpanded}
              aria-label={controlsExpanded ? "Hide filter and sort controls" : "Show filter and sort controls"}
              className={[
                "notes-navigator__controls-toggle",
                controlsExpanded ? "notes-navigator__controls-toggle--expanded" : "",
                hasHiddenControlState && !controlsExpanded
                  ? "notes-navigator__controls-toggle--active"
                  : "",
              ].filter(Boolean).join(" ")}
              title={controlsExpanded ? "Hide filter and sort" : "Show filter and sort"}
              type="button"
              onClick={() => setControlsExpanded((current) => !current)}
            >
              <AdjustmentsIcon />
            </button>
          </div>
          {controlsExpanded ? (
            <div className="notes-navigator__controls-region" id="notes-navigator-list-controls">
              <NavigatorListControls
                tab={activeTab}
                filter={filters[activeTab]}
                sort={sorts[activeTab]}
                onFilterChange={(filter) =>
                  setFilters((current) => ({ ...current, [activeTab]: filter }))
                }
                onSortChange={(sort) =>
                  setSorts((current) => ({ ...current, [activeTab]: sort }))
                }
              />
            </div>
          ) : null}
        </div>
        <NavigatorList
          notes={navigatorNotes}
          tab={activeTab}
          globalQuery={globalQuery}
          filterQuery={filters[activeTab]}
          sort={sorts[activeTab]}
          relocatedFileNote={relocatedFileNote}
          relocateTargetPath={relocateTargetPath}
        />
      </div>
    </section>
  );
}

function SearchIcon() {
  return (
    <svg className="notes-navigator__search-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.75 2a4.75 4.75 0 1 0 2.91 8.5l3.42 3.42.84-.84-3.42-3.42A4.75 4.75 0 0 0 6.75 2Zm-3.5 4.75a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0Z"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="notes-navigator__search-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="m3.7 2.85 4.3 4.3 4.3-4.3.85.85-4.3 4.3 4.3 4.3-.85.85-4.3-4.3-4.3 4.3-.85-.85 4.3-4.3-4.3-4.3.85-.85Z"
      />
    </svg>
  );
}

function AdjustmentsIcon() {
  return (
    <svg className="notes-navigator__controls-toggle-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M2 3.4h4.1a2.2 2.2 0 0 1 4.2 0H14v1.2h-3.7a2.2 2.2 0 0 1-4.2 0H2V3.4Zm6.2 1.4a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM2 7.4h1.7a2.2 2.2 0 0 1 4.2 0H14v1.2H7.9a2.2 2.2 0 0 1-4.2 0H2V7.4Zm3.8 1.4a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM2 11.4h6.1a2.2 2.2 0 0 1 4.2 0H14v1.2h-1.7a2.2 2.2 0 0 1-4.2 0H2v-1.2Zm8.2 1.4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
    </svg>
  );
}

function NavigatorTab({
  activeTab,
  tab,
  label,
  count,
  onChange,
}: {
  activeTab: NotesNavigatorTab;
  tab: NotesNavigatorTab;
  label: string;
  count?: number;
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
      {label}{count === undefined ? "" : ` ${count}`}
    </button>
  );
}

function NavigatorListControls({
  tab,
  filter,
  sort,
  onFilterChange,
  onSortChange,
}: {
  tab: NotesNavigatorTab;
  filter: string;
  sort: NavigatorSortState;
  onFilterChange: (filter: string) => void;
  onSortChange: (sort: NavigatorSortState) => void;
}) {
  const options = getSortOptions(tab);
  const label = tab === "files" ? "files" : tab === "sections" ? "sections" : "lines";

  return (
    <div className="notes-navigator__controls">
      <input
        aria-label={`Filter ${label}`}
        placeholder={`Filter ${label}…`}
        type="search"
        value={filter}
        onChange={(event) => onFilterChange(event.currentTarget.value)}
      />
      <select
        aria-label={`Sort ${label} by`}
        className="notes-navigator__sort-field"
        title={`Sort by ${getSortLabel(options, sort.field)}`}
        value={sort.field}
        onChange={(event) =>
          onSortChange({ ...sort, field: event.currentTarget.value as NavigatorSortField })
        }
      >
        {options.map((option) => (
          <option key={option.field} value={option.field}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        aria-label={sort.direction === "ascending" ? "Sort descending" : "Sort ascending"}
        className="notes-navigator__sort-direction"
        title={sort.direction === "ascending" ? "Ascending" : "Descending"}
        type="button"
        onClick={() =>
          onSortChange({
            ...sort,
            direction: sort.direction === "ascending" ? "descending" : "ascending",
          })
        }
      >
        {sort.direction === "ascending" ? "↑" : "↓"}
      </button>
    </div>
  );
}

function getSortOptions(tab: NotesNavigatorTab): Array<{ field: NavigatorSortField; label: string }> {
  if (tab === "files") {
    return [
      { field: "name", label: "Name" },
      { field: "createdAt", label: "Created" },
      { field: "updatedAt", label: "Last Updated" },
    ];
  }

  if (tab === "sections") {
    return [
      { field: "title", label: "Title" },
      { field: "createdAt", label: "Created" },
      { field: "updatedAt", label: "Last Updated" },
    ];
  }

  return [
    { field: "line", label: "Line Number" },
    { field: "createdAt", label: "Created" },
    { field: "updatedAt", label: "Last Updated" },
  ];
}

function getSortLabel(
  options: Array<{ field: NavigatorSortField; label: string }>,
  field: NavigatorSortField,
): string {
  return options.find((option) => option.field === field)?.label ?? field;
}

function getGlobalMatchCounts(notes: NavigatorNotesViewModel, query: string) {
  if (notes.kind !== "resource") {
    return { files: 0, sections: 0, lines: 0 };
  }

  return {
    files: notes.files.filter((item) => matchesGlobalSearch(item, query)).length,
    sections: notes.sections.filter((item) => matchesGlobalSearch(item, query)).length,
    lines: notes.lines.filter((item) => matchesGlobalSearch(item, query)).length,
  };
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
  relocatedFileNote,
  relocateTargetPath,
  globalQuery,
  filterQuery,
  sort,
}: {
  notes: NavigatorNotesViewModel;
  tab: NotesNavigatorTab;
  relocatedFileNote?: RelocatedFileNote;
  relocateTargetPath?: string;
  globalQuery: string;
  filterQuery: string;
  sort: NavigatorSortState;
}) {
  const [fileContextMenu, setFileContextMenu] = useState<FileContextMenuState | null>(null);
  const [sectionContextMenu, setSectionContextMenu] = useState<SectionContextMenuState | null>(
    null,
  );
  const [lineContextMenu, setLineContextMenu] = useState<LineContextMenuState | null>(null);
  const [relocateModal, setRelocateModal] = useState<RelocateModalState | null>(null);
  const [markOrphanedModal, setMarkOrphanedModal] = useState<MarkOrphanedModalState | null>(null);
  const [deleteNotesModal, setDeleteNotesModal] = useState<DeleteNotesModalState | null>(null);
  const [deleteSectionModal, setDeleteSectionModal] = useState<DeleteSectionModalState | null>(
    null,
  );
  const [deleteLineModal, setDeleteLineModal] = useState<DeleteLineModalState | null>(null);
  const handledRelocationSequence = useRef(0);

  useEffect(() => {
    if (
      !relocatedFileNote ||
      relocatedFileNote.sequence <= handledRelocationSequence.current ||
      relocateModal?.fromRelativePath !== relocatedFileNote.fromRelativePath
    ) {
      return;
    }

    handledRelocationSequence.current = relocatedFileNote.sequence;
    setRelocateModal(null);
  }, [relocatedFileNote, relocateModal?.fromRelativePath]);

  useEffect(() => {
    if (!relocateModal) {
      return;
    }

    getVsCodeApi()?.postMessage({ type: "startNavigatorFileRelocatePathSync" });

    return () => {
      getVsCodeApi()?.postMessage({ type: "stopNavigatorFileRelocatePathSync" });
    };
  }, [relocateModal]);

  const items = useMemo(
    () => {
      if (notes.kind !== "resource") {
        return [];
      }

      const sourceItems =
        tab === "files" ? notes.files : tab === "sections" ? notes.sections : notes.lines;
      return filterAndSortNavigatorItems(sourceItems, tab, globalQuery, filterQuery, sort);
    },
    [notes, tab, globalQuery, filterQuery, sort],
  );

  if (notes.kind !== "resource") {
    return <p className="notes-navigator__empty">No notes loaded yet.</p>;
  }

  if (items.length === 0) {
    const label = tab === "files" ? "file" : tab === "sections" ? "section" : "line";
    const isFiltered = Boolean(globalQuery.trim() || filterQuery.trim());
    return <p className="notes-navigator__empty">{isFiltered ? `No matching ${label} notes.` : `No ${label} notes found.`}</p>;
  }

  const openNavigatorResource = (relativePath: string): void => {
    getVsCodeApi()?.postMessage({
      type: "openNavigatorResource",
      relativePath,
    });
  };
  const viewNavigatorFileNotes = (relativePath: string, anchor: NoteStatus["anchor"]): void => {
    getVsCodeApi()?.postMessage({
      type: "viewNavigatorFileNotes",
      relativePath,
      anchor,
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
  const clearNavigatorFileStaleStatus = (relativePath: string): void => {
    getVsCodeApi()?.postMessage({
      type: "clearNavigatorFileStaleStatus",
      relativePath,
    });
  };
  const relocateNavigatorFileNote = (fromRelativePath: string, toRelativePath: string): void => {
    getVsCodeApi()?.postMessage({
      type: "relocateNavigatorFileNote",
      fromRelativePath,
      toRelativePath,
    });
  };
  const markNavigatorFileNoteOrphaned = (relativePath: string): void => {
    getVsCodeApi()?.postMessage({
      type: "markNavigatorFileNoteOrphaned",
      relativePath,
    });
  };
  const deleteNavigatorFileNotes = (relativePath: string): void => {
    getVsCodeApi()?.postMessage({
      type: "deleteNavigatorFileNotes",
      relativePath,
    });
  };
  const clearNavigatorSectionStaleStatus = (sectionId: string): void => {
    getVsCodeApi()?.postMessage({
      type: "clearNoteStaleStatus",
      target: { level: "section", sectionId },
    });
  };
  const deleteNavigatorSectionNote = (sectionId: string): void => {
    getVsCodeApi()?.postMessage({
      type: "deleteNavigatorSectionNote",
      sectionId,
    });
  };
  const clearNavigatorLineStaleStatus = (line: number): void => {
    getVsCodeApi()?.postMessage({
      type: "clearNoteStaleStatus",
      target: { level: "line", line },
    });
  };
  const deleteNavigatorLineNote = (lineId: string): void => {
    getVsCodeApi()?.postMessage({
      type: "deleteNavigatorLineNote",
      lineId,
    });
  };
  const startSectionRelocate = (section: NavigatorSectionItem): void => {
    getVsCodeApi()?.postMessage({
      type: "startNoteRelocate",
      target: {
        level: "section",
        sectionId: section.id,
        startLine: section.startLine,
        endLine: section.endLine,
      },
    });
  };
  const startLineRelocate = (line: NavigatorLineItem): void => {
    getVsCodeApi()?.postMessage({
      type: "startNoteRelocate",
      target: { level: "line", lineId: line.id, line: line.line },
    });
  };

  return (
    <>
      <ol className="notes-navigator__list">
        {items.map((item, index) => {
          if (tab === "files" && "relativePath" in item) {
            const anchor = item.status?.anchor ?? "confirmed";
            const isOrphaned = anchor === "orphaned";
            const isCurrent = item.relativePath === notes.currentResource;

            return (
              <li
                className={getNavigatorItemClassName("file", { isCurrent, isOrphaned })}
                key={item.relativePath}
                role={isOrphaned ? undefined : "button"}
                tabIndex={isOrphaned ? undefined : 0}
                onClick={() => {
                  if (!isOrphaned) {
                    openNavigatorResource(item.relativePath);
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setFileContextMenu({
                    item,
                    position: { x: event.clientX, y: event.clientY },
                  });
                }}
                onKeyDown={(event) => {
                  if (isOrphaned) {
                    return;
                  }

                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openNavigatorResource(item.relativePath);
                  }
                }}
              >
                <span className="notes-navigator__index">{index + 1}</span>
                <ResourceIcon resourceKind={item.resourceKind} />
                <span className="notes-navigator__item-main">
                  <Tooltip content={item.relativePath}>
                    <strong className="notes-navigator__item-name">{item.name}</strong>
                  </Tooltip>
                  <span className="notes-navigator__item-preview">{item.preview}</span>
                </span>
                <span className="notes-navigator__item-meta">
                  <NoteStatusBadges status={item.status} scope="file" />
                </span>
              </li>
            );
          }

          if (tab === "sections" && "startLine" in item) {
            const isCurrent = item.id === notes.activeSectionId;

            return (
              <li
                className={getNavigatorItemClassName("section", { isCurrent })}
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => openNavigatorSection(item)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setSectionContextMenu({
                    item,
                    position: { x: event.clientX, y: event.clientY },
                  });
                }}
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
                <span className="notes-navigator__item-meta">
                  <NoteStatusBadges status={item.status} scope="section" />
                  <span className="notes-navigator__item-location">
                    L{item.startLine}-{item.endLine}
                  </span>
                </span>
              </li>
            );
          }

          if ("line" in item) {
            const isCurrent = item.line === notes.activeLine;

            return (
              <li
                className={getNavigatorItemClassName("line", { isCurrent })}
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => openNavigatorLine(item.line)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setLineContextMenu({
                    item,
                    position: { x: event.clientX, y: event.clientY },
                  });
                }}
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
                <span className="notes-navigator__item-meta">
                  <NoteStatusBadges status={item.status} scope="line" />
                </span>
              </li>
            );
          }

          return null;
        })}
      </ol>
      {fileContextMenu ? (
        <NavigatorItemContextMenu
          items={getFileContextMenuItems(
            fileContextMenu.item.status,
            () =>
              viewNavigatorFileNotes(
                fileContextMenu.item.relativePath,
                fileContextMenu.item.status?.anchor ?? "confirmed",
              ),
            () => clearNavigatorFileStaleStatus(fileContextMenu.item.relativePath),
            () => {
              setRelocateModal({ fromRelativePath: fileContextMenu.item.relativePath });
              setFileContextMenu(null);
            },
            () => {
              setMarkOrphanedModal({ relativePath: fileContextMenu.item.relativePath });
              setFileContextMenu(null);
            },
            () => {
              setDeleteNotesModal({ relativePath: fileContextMenu.item.relativePath });
              setFileContextMenu(null);
            },
          )}
          position={fileContextMenu.position}
          onClose={() => setFileContextMenu(null)}
        />
      ) : null}
      {sectionContextMenu ? (
        <NavigatorItemContextMenu
          items={getSectionContextMenuItems(
            sectionContextMenu.item.status,
            () => openNavigatorSection(sectionContextMenu.item),
            () => clearNavigatorSectionStaleStatus(sectionContextMenu.item.id),
            () => {
              startSectionRelocate(sectionContextMenu.item);
              setSectionContextMenu(null);
            },
            () => {
              setDeleteSectionModal({
                sectionId: sectionContextMenu.item.id,
                title: sectionContextMenu.item.title || "Untitled section",
              });
              setSectionContextMenu(null);
            },
          )}
          position={sectionContextMenu.position}
          onClose={() => setSectionContextMenu(null)}
        />
      ) : null}
      {lineContextMenu ? (
        <NavigatorItemContextMenu
          items={getLineContextMenuItems(
            lineContextMenu.item.status,
            () => openNavigatorLine(lineContextMenu.item.line),
            () => clearNavigatorLineStaleStatus(lineContextMenu.item.line),
            () => {
              startLineRelocate(lineContextMenu.item);
              setLineContextMenu(null);
            },
            () => {
              setDeleteLineModal({
                lineId: lineContextMenu.item.id,
                line: lineContextMenu.item.line,
              });
              setLineContextMenu(null);
            },
          )}
          position={lineContextMenu.position}
          onClose={() => setLineContextMenu(null)}
        />
      ) : null}
      {relocateModal ? (
        <RelocateFileNoteModal
          fromRelativePath={relocateModal.fromRelativePath}
          suggestedRelativePath={relocateTargetPath}
          onCancel={() => setRelocateModal(null)}
          onSubmit={(toRelativePath) =>
            relocateNavigatorFileNote(relocateModal.fromRelativePath, toRelativePath)
          }
        />
      ) : null}
      {markOrphanedModal ? (
        <NoticeModal
          tone="warning"
          title="Mark File Note as Orphaned?"
          message="This will mark the note as no longer attached to a valid file. The note will stay in the file list, but opening it will no longer jump to a source file until you relocate it again."
          actions={[
            {
              label: "Cancel",
              variant: "secondary",
              onClick: () => setMarkOrphanedModal(null),
            },
            {
              label: "Mark as Orphaned",
              variant: "primary",
              onClick: () => {
                markNavigatorFileNoteOrphaned(markOrphanedModal.relativePath);
                setMarkOrphanedModal(null);
              },
            },
          ]}
          onDismiss={() => setMarkOrphanedModal(null)}
        />
      ) : null}
      {deleteNotesModal ? (
        <NoticeModal
          tone="error"
          title="Delete Notes?"
          message="This will permanently remove all CZaza notes for this file, including file, section, and line notes. The source file will not be deleted."
          actions={[
            {
              label: "Cancel",
              variant: "secondary",
              onClick: () => setDeleteNotesModal(null),
            },
            {
              label: "Delete Notes",
              variant: "primary",
              onClick: () => {
                deleteNavigatorFileNotes(deleteNotesModal.relativePath);
                setDeleteNotesModal(null);
              },
            },
          ]}
          onDismiss={() => setDeleteNotesModal(null)}
        />
      ) : null}
      {deleteSectionModal ? (
        <NoticeModal
          tone="error"
          title="Delete Section Note?"
          message={`This will permanently remove the section note "${deleteSectionModal.title}". File notes, line notes, and source code will not be deleted.`}
          actions={[
            {
              label: "Cancel",
              variant: "secondary",
              onClick: () => setDeleteSectionModal(null),
            },
            {
              label: "Delete Section",
              variant: "primary",
              onClick: () => {
                deleteNavigatorSectionNote(deleteSectionModal.sectionId);
                setDeleteSectionModal(null);
              },
            },
          ]}
          onDismiss={() => setDeleteSectionModal(null)}
        />
      ) : null}
      {deleteLineModal ? (
        <NoticeModal
          tone="error"
          title="Delete Line Note?"
          message={`This will permanently remove the note for line ${deleteLineModal.line}. File notes, section notes, and source code will not be deleted.`}
          actions={[
            {
              label: "Cancel",
              variant: "secondary",
              onClick: () => setDeleteLineModal(null),
            },
            {
              label: "Delete Line",
              variant: "primary",
              onClick: () => {
                deleteNavigatorLineNote(deleteLineModal.lineId);
                setDeleteLineModal(null);
              },
            },
          ]}
          onDismiss={() => setDeleteLineModal(null)}
        />
      ) : null}
    </>
  );
}

function getFileContextMenuItems(
  status: NoteStatus | undefined,
  onViewNotes: () => void,
  onClearStaleStatus: () => void,
  onRelocate: () => void,
  onMarkOrphaned: () => void,
  onDeleteNotes: () => void,
): NavigatorItemContextMenuItem[] {
  return [
    {
      id: "viewNotes",
      label: "View Notes",
      onSelect: onViewNotes,
    },
    ...(status?.content === "stale"
      ? [
          {
            id: "clearStale" as const,
            label: "Clear Content Stale: Mark File Note Reviewed",
            onSelect: onClearStaleStatus,
          },
        ]
      : []),
    {
      id: "relocate",
      label: "Relocate...",
      onSelect: onRelocate,
    },
    ...(status?.anchor !== "orphaned"
      ? [
          {
            id: "markOrphaned" as const,
            label: "Mark as Orphaned...",
            onSelect: onMarkOrphaned,
          },
        ]
      : []),
    {
      id: "delete",
      label: "Delete Notes...",
      onSelect: onDeleteNotes,
    },
  ];
}

function getSectionContextMenuItems(
  status: NoteStatus | undefined,
  onViewNotes: () => void,
  onClearStaleStatus: () => void,
  onRelocate: () => void,
  onDeleteNote: () => void,
): NavigatorItemContextMenuItem[] {
  return [
    {
      id: "viewNotes",
      label: "View Notes",
      onSelect: onViewNotes,
    },
    ...(status?.content === "stale"
      ? [
          {
            id: "clearStale" as const,
            label: "Clear Content Stale: Mark Section Reviewed",
            onSelect: onClearStaleStatus,
          },
        ]
      : []),
    {
      id: "relocate",
      label: "Relocate Section Note...",
      onSelect: onRelocate,
    },
    {
      id: "delete",
      label: "Delete Section Note...",
      onSelect: onDeleteNote,
    },
  ];
}

function getLineContextMenuItems(
  status: NoteStatus | undefined,
  onViewNotes: () => void,
  onClearStaleStatus: () => void,
  onRelocate: () => void,
  onDeleteNote: () => void,
): NavigatorItemContextMenuItem[] {
  return [
    {
      id: "viewNotes",
      label: "View Notes",
      onSelect: onViewNotes,
    },
    ...(status?.content === "stale"
      ? [
          {
            id: "clearStale" as const,
            label: "Clear Content Stale: Mark Line Reviewed",
            onSelect: onClearStaleStatus,
          },
        ]
      : []),
    {
      id: "relocate",
      label: "Relocate Line Note...",
      onSelect: onRelocate,
    },
    {
      id: "delete",
      label: "Delete Line Note...",
      onSelect: onDeleteNote,
    },
  ];
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
