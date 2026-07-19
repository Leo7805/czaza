/** Renders file-level user notes for a non-text resource. */

import type { ResourceNotesViewModel } from "../types";
import { getVsCodeApi } from "../vscodeApi";
import { NoteCard } from "./NoteCard";
import { NotesPanel } from "./NotesPanel";

export function BinaryFileNotesView({
  notes,
}: {
  notes: Extract<ResourceNotesViewModel, { kind: "binary" }>;
}) {
  return (
    <NotesPanel
      kind="binary"
      name={notes.name}
      relativePath={notes.relativePath}
      showHeaderAction={false}
    >
      <NoteCard
        title="File Notes"
        variant="file"
        userNote={notes.fileNote?.userNote}
        status={notes.fileNote?.status}
        statusTarget={{ level: "file" }}
        onClearStaleStatus={(target) =>
          getVsCodeApi()?.postMessage({ type: "clearNoteStaleStatus", target })
        }
        showTabs={false}
        editKey={`binary:${notes.relativePath}`}
        startInEditMode={notes.editTarget?.level === "file"}
        onSaveUserNote={(userNote) =>
          getVsCodeApi()?.postMessage({
            type: "saveUserNote",
            target: { level: "file" },
            userNote,
          })
        }
        emptyText="No file note yet."
      />
    </NotesPanel>
  );
}
