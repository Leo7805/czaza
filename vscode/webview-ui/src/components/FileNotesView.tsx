/**
 * Renders notes for a file resource.
 */

import { useEffect, useState } from "react";

import type {
  ResourceNotesViewModel,
  ResourceSectionNoteContent,
  UserNoteTarget,
} from "../types";
import { useNoteTabSelection } from "../hooks/useNoteTabSelection";
import { getVsCodeApi } from "../vscodeApi";
import { AiGenerationMenu, type GenerationScope } from "./AiGenerationMenu";
import { NoteCard } from "./NoteCard";
import { NoticeModal } from "./NoticeModal";
import { NotesPanel } from "./NotesPanel";
import { Tooltip } from "./Tooltip";

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
  const [showAllNotesConfirm, setShowAllNotesConfirm] = useState(false);
  const editTarget = notes.editTarget;
  const [sectionSelection, setSectionSelection] = useState({
    relativePath: notes.relativePath,
    sectionId: notes.selectedSectionId ?? firstSectionId,
  });
  const preferredSectionId =
    editTarget?.level === "section" &&
    notes.sectionNotes.some((section) => section.id === editTarget.sectionId)
      ? editTarget.sectionId
      : notes.selectedSectionId &&
          notes.sectionNotes.some((section) => section.id === notes.selectedSectionId)
        ? notes.selectedSectionId
        : firstSectionId;
  const requestedSectionId =
    sectionSelection.relativePath === notes.relativePath
      ? sectionSelection.sectionId
      : preferredSectionId;
  const selectedSection =
    notes.sectionNotes.find((section) => section.id === requestedSectionId) ??
    notes.sectionNotes[0];
  const shouldEditSection =
    editTarget?.level === "section" && selectedSection?.id === editTarget.sectionId;
  const shouldEditLine = editTarget?.level === "line" && notes.activeLine === editTarget.line;
  const runningScope = notes.aiActionRunningScope ?? (notes.isAiActionRunning ? "fileSection" : undefined);
  const isAnyAiActionRunning = Boolean(runningScope);
  const {
    fileTab,
    sectionTab,
    lineTab,
    selectFileTab,
    selectSectionTab,
    selectLineTab,
  } = useNoteTabSelection({
    relativePath: notes.relativePath,
    file: {
      identity: `file:${notes.relativePath}`,
      userNote: notes.fileNote?.userNote,
      aiExplanation: notes.fileNote?.aiExplanation,
    },
    section: {
      identity: `section:${notes.relativePath}:${selectedSection?.id ?? "none"}`,
      userNote: selectedSection?.userNote,
      aiExplanation: selectedSection?.aiExplanation,
    },
    line: {
      identity: `line:${notes.relativePath}:${notes.lineNote?.id ?? notes.activeLine ?? "none"}`,
      userNote: notes.lineNote?.userNote,
      aiExplanation: notes.lineNote?.aiExplanation,
    },
    revealAiNotes: notes.revealAiNotes,
  });

  useEffect(() => {
    setSectionSelection({
      relativePath: notes.relativePath,
      sectionId: preferredSectionId,
    });
  }, [notes.relativePath, preferredSectionId]);

  const selectSection = (sectionId: string): void => {
    setSectionSelection({ relativePath: notes.relativePath, sectionId });
    getVsCodeApi()?.postMessage({ type: "selectSection", sectionId });
  };

  const generateFileNotes = (): void => {
    getVsCodeApi()?.postMessage({ type: "generateFileNotes" });
  };

  const generateAllNotes = (): void => {
    setShowAllNotesConfirm(false);
    getVsCodeApi()?.postMessage({ type: "generateAllNotes" });
  };

  const generateLineNote = (scope: GenerationScope): void => {
    if (scope !== "currentLine" && scope !== "nearbyLines") {
      return;
    }

    getVsCodeApi()?.postMessage({ type: "generateLineNote", lineScope: scope });
  };

  const generateSectionNote = (): void => {
    if (selectedSection) {
      getVsCodeApi()?.postMessage({
        type: "generateSectionNote",
        sectionId: selectedSection.id,
      });
    }
  };

  const saveUserNote = (target: UserNoteTarget, userNote: string): void => {
    getVsCodeApi()?.postMessage({ type: "saveUserNote", target, userNote });
  };

  const clearStale = (target: UserNoteTarget): void => {
    getVsCodeApi()?.postMessage({ type: "clearNoteStaleStatus", target });
  };

  const startFileRelocate = (): void => {
    getVsCodeApi()?.postMessage({
      type: "startNoteRelocate",
      target: { level: "file", fromRelativePath: notes.relativePath },
    });
  };

  const startSectionRelocate = (): void => {
    if (!selectedSection) {
      return;
    }
    getVsCodeApi()?.postMessage({
      type: "startNoteRelocate",
      target: {
        level: "section",
        sectionId: selectedSection.id,
        startLine: selectedSection.startLine,
        endLine: selectedSection.endLine,
      },
    });
  };

  const startLineRelocate = (): void => {
    if (!notes.lineNote) {
      return;
    }
    getVsCodeApi()?.postMessage({
      type: "startNoteRelocate",
      target: {
        level: "line",
        lineId: notes.lineNote.id,
        line: notes.lineNote.line,
      },
    });
  };

  return (
      <NotesPanel
        kind="file"
      name={notes.name}
      relativePath={notes.relativePath}
      headerActionLabel={notes.aiAction === "regenerate" ? "Regenerate" : "Generate"}
      isHeaderActionRunning={runningScope === "fileSection" || runningScope === "all"}
      isAnyAiActionRunning={isAnyAiActionRunning}
      batchProgress={notes.aiBatchProgress}
      onGenerateFileSection={generateFileNotes}
      onGenerateAll={() => setShowAllNotesConfirm(true)}
    >
      <NoteCard
        title="File Notes"
        titleTooltip={getFileNoteTimeTooltip(notes.fileNote)}
        variant="file"
        activeTab={fileTab}
        onTabChange={selectFileTab}
        userNote={notes.fileNote?.userNote}
        aiExplanation={notes.fileNote?.aiExplanation}
        status={notes.fileNote?.status}
        runtimeStatus={notes.fileNote?.runtimeStatus}
        statusTarget={{ level: "file" }}
        onClearStaleStatus={clearStale}
        onRelocate={notes.fileNote ? startFileRelocate : undefined}
        editKey={`file:${notes.relativePath}`}
        onSaveUserNote={(userNote) => saveUserNote({ level: "file" }, userNote)}
        emptyText="No file note yet."
      />
      <NoteCard
        title="Section Notes"
        variant="section"
        activeTab={sectionTab}
        onTabChange={selectSectionTab}
        aiActionLabel={selectedSection?.aiExplanation ? "Regenerate" : "Generate"}
        isAiActionRunning={runningScope === "section"}
        isAiActionDisabled={isAnyAiActionRunning && runningScope !== "section"}
        onGenerateAi={selectedSection ? generateSectionNote : undefined}
        userNote={selectedSection?.userNote}
        aiExplanation={selectedSection?.aiExplanation}
        status={selectedSection?.status}
        runtimeStatus={selectedSection?.runtimeStatus}
        statusTarget={
          selectedSection ? { level: "section", sectionId: selectedSection.id } : undefined
        }
        onClearStaleStatus={clearStale}
        onRelocate={selectedSection ? startSectionRelocate : undefined}
        editKey={selectedSection ? `section:${selectedSection.id}` : undefined}
        startInEditMode={shouldEditSection}
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
        activeTab={lineTab}
        onTabChange={selectLineTab}
        aiAction={
          notes.activeLine ? (
            <AiGenerationMenu
              actionLabel={notes.lineNote?.aiExplanation ? "Regenerate" : "Generate"}
              isRunning={runningScope === "line"}
              isDisabled={isAnyAiActionRunning && runningScope !== "line"}
              scopeOptions={[
                { scope: "currentLine", label: "Current Line" },
                { scope: "nearbyLines", label: "Nearby Lines" },
              ]}
              defaultScope="nearbyLines"
              onGenerateScope={generateLineNote}
            />
          ) : undefined
        }
        userNote={notes.lineNote?.userNote}
        aiExplanation={notes.lineNote?.aiExplanation}
        status={notes.lineNote?.status}
        runtimeStatus={notes.lineNote?.runtimeStatus}
        statusTarget={notes.activeLine ? { level: "line", line: notes.activeLine } : undefined}
        onClearStaleStatus={clearStale}
        onRelocate={notes.lineNote ? startLineRelocate : undefined}
        editKey={notes.activeLine ? `line:${notes.activeLine}` : undefined}
        startInEditMode={shouldEditLine}
        onSaveUserNote={
          notes.activeLine
            ? (userNote) => saveUserNote({ level: "line", line: notes.activeLine! }, userNote)
            : undefined
        }
        headerAccessory={
          notes.activeLine ? (
            <SourceLocationBadge
              label={`L${notes.activeLine}`}
              title={`Line ${notes.activeLine}`}
            />
          ) : undefined
        }
        emptyText="No line note selected."
      />
      {showAllNotesConfirm ? (
        <NoticeModal
          tone="warning"
          title="Generate All Notes"
          message="This may take longer and use more AI tokens."
          actions={[
            {
              label: "Cancel",
              variant: "secondary",
              onClick: () => setShowAllNotesConfirm(false),
            },
            {
              label: "Generate All Notes",
              variant: "primary",
              onClick: generateAllNotes,
            },
          ]}
          onDismiss={() => setShowAllNotesConfirm(false)}
        />
      ) : null}
    </NotesPanel>
  );
}

function getFileNoteTimeTooltip(
  fileNote: Extract<ResourceNotesViewModel, { kind: "file" }>["fileNote"],
) {
  const created = formatLocalTimestamp(fileNote?.createdAt);
  const updated = formatLocalTimestamp(fileNote?.updatedAt);

  if (!created && !updated) {
    return undefined;
  }

  return (
    <span className="note-time-tooltip">
      {created ? (
        <>
          <span>Created</span>
          <span className="note-time-tooltip__value">{created}</span>
        </>
      ) : null}
      {updated ? (
        <>
          <span>Last updated</span>
          <span className="note-time-tooltip__value">{updated}</span>
        </>
      ) : null}
    </span>
  );
}

function formatLocalTimestamp(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";

  return `${part("year")}.${part("month")}.${part("day")} ${part("hour")}:${part("minute")}`;
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
    const title = (
      <span className="section-context__title">{getSectionDisplayTitle(selectedSection)}</span>
    );

    return (
      <div className="section-context">
        {selectedSection.kind ? (
          <Tooltip content={selectedSection.kind} variant="section">
            {title}
          </Tooltip>
        ) : (
          title
        )}
        <SourceLocationBadge
          label={label}
          title={`${getSectionDisplayTitle(selectedSection)} · ${label}`}
        />
      </div>
    );
  }

  const selector = (
    <select
      className="section-selector"
      aria-label="Current section"
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

  return selectedSection.kind ? (
    <Tooltip content={selectedSection.kind} variant="section">
      {selector}
    </Tooltip>
  ) : (
    selector
  );
}

function formatSectionOption(section: ResourceSectionNoteContent): string {
  return `${getSectionDisplayTitle(section)} · ${formatSectionRange(section)}`;
}

function getSectionDisplayTitle(section: ResourceSectionNoteContent): string {
  return section.title.trim() || `Section ${formatSectionRange(section)}`;
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
