/**
 * Renders notes for a directory resource.
 */

import type { ResourceChildNotePreview, ResourceNotesViewModel } from "../types";
import { getVsCodeApi } from "../vscodeApi";
import { NoteCard } from "./NoteCard";
import { NotesPanel } from "./NotesPanel";
import { Tooltip } from "./Tooltip";

/**
 * Renders directory-level notes and first-level child note previews.
 *
 * @param props - Component props.
 * @param props.notes - Directory notes payload.
 * @returns React element for a directory resource.
 *
 * @example
 * <DirectoryNotesView notes={notes} />
 */
export function DirectoryNotesView({
  notes,
}: {
  notes: Extract<ResourceNotesViewModel, { kind: "directory" }>;
}) {
  return (
    <NotesPanel
      kind="directory"
      name={notes.name}
      relativePath={notes.relativePath}
      showHeaderAction={false}
    >
      <NoteCard
        title="File Notes"
        variant="file"
        userNote={notes.fileNote?.userNote}
        showTabs={false}
        editKey={`directory:${notes.relativePath}`}
        onSaveUserNote={(userNote) =>
          getVsCodeApi()?.postMessage({
            type: "saveUserNote",
            target: { level: "file" },
            userNote,
          })
        }
        emptyText="No directory note yet."
      />
      <ChildNotesCard children={notes.children} />
    </NotesPanel>
  );
}

function ChildNotesCard({ children }: { children: ResourceChildNotePreview[] }) {
  return (
    <section className={children.length > 0 ? "notes-card notes-card--child" : "notes-card notes-card--child notes-card--empty"}>
      <div className="notes-card__head">
        <h2 className="notes-card__title">Child Notes</h2>
        <span className="notes-card__badge">{children.length}</span>
      </div>
      {children.length > 0 ? (
        <ul className="child-list">
          {children.map((child) => (
            <ChildNoteItem child={child} key={child.relativePath} />
          ))}
        </ul>
      ) : (
        <p className="notes-muted">No first-level child notes.</p>
      )}
    </section>
  );
}

function ChildNoteItem({ child }: { child: ResourceChildNotePreview }) {
  return (
    <li className="child-list__item">
      <Tooltip content={child.name}>
        <span className="child-list__name">{child.name}</span>
      </Tooltip>
      <Tooltip content={child.notePreview}>
        <span className="child-list__preview">{child.notePreview}</span>
      </Tooltip>
    </li>
  );
}
