/**
 * Manages User/AI tab defaults and in-memory selections for detailed Notes.
 */

import { useEffect, useRef, useState } from "react";

import type { ResourceAiExplanation } from "../types";

/** User or AI source displayed by one Note card. */
export type NoteSourceTab = "user" | "ai";

type NoteTabTarget = {
  identity: string;
  userNote?: string;
  aiExplanation?: ResourceAiExplanation;
};

type NoteTabSelection = {
  identity: string;
  tab: NoteSourceTab;
};

type NoteTabSelections = {
  file: NoteTabSelection;
  section: NoteTabSelection;
  line: NoteTabSelection;
};

/**
 * Chooses the default tab for one Note from its available content.
 *
 * @param userNote - Optional User Note content.
 * @param aiExplanation - Optional AI Note content.
 * @returns AI only when AI has content and User is empty; otherwise User.
 */
export function getDefaultNoteTab(
  userNote?: string,
  aiExplanation?: ResourceAiExplanation,
): NoteSourceTab {
  return !userNote?.trim() && hasAiNoteContent(aiExplanation) ? "ai" : "user";
}

/**
 * Keeps manual tab choices in memory while navigating Notes in one file.
 *
 * @param input - Current file identity, Note targets, and optional AI reveal request.
 * @returns Active tabs and handlers for explicit user selections.
 */
export function useNoteTabSelection(input: {
  relativePath: string;
  file: NoteTabTarget;
  section: NoteTabTarget;
  line: NoteTabTarget;
  revealAiNotes?: "fileSection" | "all" | "section" | "line";
}): {
  fileTab: NoteSourceTab;
  sectionTab: NoteSourceTab;
  lineTab: NoteSourceTab;
  selectFileTab: (tab: NoteSourceTab) => void;
  selectSectionTab: (tab: NoteSourceTab) => void;
  selectLineTab: (tab: NoteSourceTab) => void;
} {
  const rememberedTabs = useRef(new Map<string, NoteSourceTab>());
  const previousRelativePath = useRef(input.relativePath);
  const [selections, setSelections] = useState<NoteTabSelections>(() =>
    createInitialSelections(input),
  );
  const fileIdentity = input.file.identity;
  const fileUserNote = input.file.userNote;
  const fileAiExplanation = input.file.aiExplanation;
  const sectionIdentity = input.section.identity;
  const sectionUserNote = input.section.userNote;
  const sectionAiExplanation = input.section.aiExplanation;
  const lineIdentity = input.line.identity;
  const lineUserNote = input.line.userNote;
  const lineAiExplanation = input.line.aiExplanation;

  useEffect(() => {
    const fileChanged = previousRelativePath.current !== input.relativePath;

    if (fileChanged) {
      rememberedTabs.current.clear();
      previousRelativePath.current = input.relativePath;
    }

    setSelections((current) => ({
      file: resolveTargetSelection(
        {
          identity: fileIdentity,
          userNote: fileUserNote,
          aiExplanation: fileAiExplanation,
        },
        current.file,
        rememberedTabs.current,
        fileChanged,
      ),
      section: resolveTargetSelection(
        {
          identity: sectionIdentity,
          userNote: sectionUserNote,
          aiExplanation: sectionAiExplanation,
        },
        current.section,
        rememberedTabs.current,
        fileChanged,
      ),
      line: resolveTargetSelection(
        {
          identity: lineIdentity,
          userNote: lineUserNote,
          aiExplanation: lineAiExplanation,
        },
        current.line,
        rememberedTabs.current,
        fileChanged,
      ),
    }));
  }, [
    input.relativePath,
    fileIdentity,
    fileUserNote,
    fileAiExplanation,
    sectionIdentity,
    sectionUserNote,
    sectionAiExplanation,
    lineIdentity,
    lineUserNote,
    lineAiExplanation,
  ]);

  useEffect(() => {
    setSelections((current) => applyAiReveal(current, input.revealAiNotes));
  }, [input.revealAiNotes]);

  const selectTab = (
    target: keyof NoteTabSelections,
    tab: NoteSourceTab,
  ): void => {
    setSelections((current) => {
      const selection = current[target];

      rememberedTabs.current.set(selection.identity, tab);

      return {
        ...current,
        [target]: { ...selection, tab },
      };
    });
  };

  return {
    fileTab: selections.file.tab,
    sectionTab: selections.section.tab,
    lineTab: selections.line.tab,
    selectFileTab: (tab) => selectTab("file", tab),
    selectSectionTab: (tab) => selectTab("section", tab),
    selectLineTab: (tab) => selectTab("line", tab),
  };
}

/**
 * Creates the first tab selections, including an explicit AI reveal request.
 *
 * @param input - Initial Note targets and reveal request.
 * @returns Initial File, Section, and Line selections.
 */
function createInitialSelections(input: {
  file: NoteTabTarget;
  section: NoteTabTarget;
  line: NoteTabTarget;
  revealAiNotes?: "fileSection" | "all" | "section" | "line";
}): NoteTabSelections {
  return applyAiReveal(
    {
      file: createDefaultSelection(input.file),
      section: createDefaultSelection(input.section),
      line: createDefaultSelection(input.line),
    },
    input.revealAiNotes,
  );
}

/**
 * Resolves a target from its current, remembered, or content-derived selection.
 *
 * @param target - Current Note identity and content.
 * @param current - Selection currently rendered for this card.
 * @param rememberedTabs - Manual selections keyed by Note identity.
 * @param forceDefault - Whether a file switch requires a fresh default.
 * @returns Selection to display for the target.
 */
function resolveTargetSelection(
  target: NoteTabTarget,
  current: NoteTabSelection,
  rememberedTabs: ReadonlyMap<string, NoteSourceTab>,
  forceDefault: boolean,
): NoteTabSelection {
  if (!forceDefault && current.identity === target.identity) {
    return current;
  }

  return {
    identity: target.identity,
    tab:
      rememberedTabs.get(target.identity) ??
      getDefaultNoteTab(target.userNote, target.aiExplanation),
  };
}

/**
 * Creates one content-derived target selection.
 *
 * @param target - Note identity and content.
 * @returns Default selection for the target.
 */
function createDefaultSelection(target: NoteTabTarget): NoteTabSelection {
  return {
    identity: target.identity,
    tab: getDefaultNoteTab(target.userNote, target.aiExplanation),
  };
}

/**
 * Applies an explicit AI reveal request without recording a manual preference.
 *
 * @param selections - Current selections.
 * @param revealAiNotes - AI scope requested by the extension host.
 * @returns Selections after applying the reveal request.
 */
function applyAiReveal(
  selections: NoteTabSelections,
  revealAiNotes: "fileSection" | "all" | "section" | "line" | undefined,
): NoteTabSelections {
  return {
    file: {
      ...selections.file,
      tab:
        revealAiNotes === "fileSection" || revealAiNotes === "all"
          ? "ai"
          : selections.file.tab,
    },
    section: {
      ...selections.section,
      tab:
        revealAiNotes === "fileSection" ||
        revealAiNotes === "all" ||
        revealAiNotes === "section"
          ? "ai"
          : selections.section.tab,
    },
    line: {
      ...selections.line,
      tab:
        revealAiNotes === "all" || revealAiNotes === "line"
          ? "ai"
          : selections.line.tab,
    },
  };
}

/**
 * Reports whether an AI explanation contains visible text.
 *
 * @param explanation - Optional AI explanation.
 * @returns True when summary, detail, or an additional AI note has content.
 */
function hasAiNoteContent(explanation?: ResourceAiExplanation): boolean {
  return Boolean(
    explanation &&
      [explanation.summary, explanation.detail, ...(explanation.aiNotes ?? [])]
        .some((value) => value.trim()),
  );
}
