/**
 * Renders notes for a file resource.
 */

import { useEffect, useState } from "react";

import type {
  ResourceNotesViewModel,
  ResourceSectionNoteContent,
  UserNoteTarget,
} from "../types";
import { getVsCodeApi } from "../vscodeApi";
import { NoteCard } from "./NoteCard";
import { NotesPanel } from "./NotesPanel";

/**
 * Renders file-level note preview content.
 *
 * @param props - Component props.
 * @param props.notes - File notes payload.
 * @returns React element for a file resource.
 *
 * @example
 * <FileNotesView notes={notes} />
 */
export function FileNotesView({
  notes,
}: {
  notes: Extract<ResourceNotesViewModel, { kind: "file" }>;
}) {
  const firstSectionId = notes.sectionNotes[0]?.id;
  const initialGeneratedTab = notes.revealAiNotes ? "ai" : "user";
  const [fileTab, setFileTab] = useState<"user" | "ai">(initialGeneratedTab);
  const [sectionTab, setSectionTab] = useState<"user" | "ai">(initialGeneratedTab);
  const [sectionSelection, setSectionSelection] = useState({
    relativePath: notes.relativePath,
    sectionId: firstSectionId,
  });
  const requestedSectionId =
    sectionSelection.relativePath === notes.relativePath
      ? sectionSelection.sectionId
      : firstSectionId;
  const selectedSection =
    notes.sectionNotes.find((section) => section.id === requestedSectionId) ??
    notes.sectionNotes[0];

  useEffect(() => {
    setFileTab("user");
    setSectionTab("user");
  }, [notes.relativePath]);

  useEffect(() => {
    if (notes.revealAiNotes) {
      setFileTab("ai");
      setSectionTab("ai");
    }
  }, [notes.revealAiNotes]);

  const selectSection = (sectionId: string): void => {
    setSectionSelection({ relativePath: notes.relativePath, sectionId });
    getVsCodeApi()?.postMessage({ type: "selectSection", sectionId });
  };

  const generateFileNotes = (): void => {
    getVsCodeApi()?.postMessage({ type: "generateFileNotes" });
  };

  const saveUserNote = (target: UserNoteTarget, userNote: string): void => {
    getVsCodeApi()?.postMessage({ type: "saveUserNote", target, userNote });
  };

  return (
    <NotesPanel
      kind="file"
      name={notes.name}
      relativePath={notes.relativePath}
      headerActionLabel={notes.aiAction === "regenerate" ? "Regenerate" : "Generate"}
      isHeaderActionRunning={notes.isAiActionRunning}
      onHeaderAction={generateFileNotes}
    >
      <NoteCard
        title="File Notes"
        variant="file"
        activeTab={fileTab}
        onTabChange={setFileTab}
        userNote={notes.fileNote?.userNote}
        aiExplanation={notes.fileNote?.aiExplanation}
        editKey={`file:${notes.relativePath}`}
        onSaveUserNote={(userNote) => saveUserNote({ level: "file" }, userNote)}
        emptyText="No file note yet."
      />
      <NoteCard
        title="Section Notes"
        variant="section"
        activeTab={sectionTab}
        onTabChange={setSectionTab}
        userNote={selectedSection?.userNote}
        aiExplanation={selectedSection?.aiExplanation}
        editKey={selectedSection ? `section:${selectedSection.id}` : undefined}
        onSaveUserNote={
          selectedSection
            ? (userNote) =>
                saveUserNote({ level: "section", sectionId: selectedSection.id }, userNote)
            : undefined
        }
        headerAccessory={
          selectedSection ? (
            <SectionRangeControl
              sections={notes.sectionNotes}
              selectedSectionId={selectedSection.id}
              onChange={selectSection}
            />
          ) : undefined
        }
        emptyText="No section note selected."
      />
      <NoteCard
        title="Line Notes"
        variant="line"
        userNote={notes.lineNote?.userNote}
        aiExplanation={notes.lineNote?.aiExplanation}
        editKey={notes.activeLine ? `line:${notes.activeLine}` : undefined}
        onSaveUserNote={
          notes.activeLine
            ? (userNote) => saveUserNote({ level: "line", line: notes.activeLine! }, userNote)
            : undefined
        }
        headerAccessory={
          notes.activeLine ? (
            <SourceLocationBadge label={`L${notes.activeLine}`} title={`Line ${notes.activeLine}`} />
          ) : undefined
        }
        emptyText="No line note selected."
      />
    </NotesPanel>
  );
}

function SectionRangeControl({
  sections,
  selectedSectionId,
  onChange,
}: {
  sections: ResourceSectionNoteContent[];
  selectedSectionId: string;
  onChange: (sectionId: string) => void;
}) {
  const selectedSection = sections.find((section) => section.id === selectedSectionId);

  if (!selectedSection) {
    return null;
  }

  if (sections.length === 1) {
    const label = formatSectionRange(selectedSection);

    return (
      <div className="section-context">
        <span className="section-context__title" title={selectedSection.title}>
          {selectedSection.title}
        </span>
        <SourceLocationBadge label={label} title={`${selectedSection.title} · ${label}`} />
      </div>
    );
  }

  return (
    <select
      className="section-selector"
      aria-label="Current section"
      title="Select a section containing the active line"
      value={selectedSectionId}
      onChange={(event) => onChange(event.target.value)}
    >
      {sections.map((section) => (
        <option key={section.id} value={section.id}>
          {formatSectionOption(section)}
        </option>
      ))}
    </select>
  );
}

function formatSectionOption(section: ResourceSectionNoteContent): string {
  return `${section.title} · ${formatSectionRange(section)}`;
}

function formatSectionRange(section: ResourceSectionNoteContent): string {
  return section.startLine === section.endLine
    ? `L${section.startLine}`
    : `L${section.startLine}-${section.endLine}`;
}

function SourceLocationBadge({ label, title }: { label: string; title: string }) {
  return (
    <span className="source-location-badge" title={title}>
      {label}
    </span>
  );
}
