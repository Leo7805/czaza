/**
 * Converts AI analysis DTOs into domain note models.
 */

import type { FileSectionAnalysis } from "@shared/services/explainFileSectionService";
import type { FileAnalysis } from "@shared/models/ai/file";
import type { LineAnalysis, LineAnalysisEntry } from "@shared/models/ai/line";
import type { SectionAnalysis } from "@shared/models/ai/section";
import type { FileNote } from "@shared/models/domain/file";
import type { LineNote } from "@shared/models/domain/line";
import type { SectionNote } from "@shared/models/domain/section";
import { createCurrentConfirmedStatus } from "@shared/models/domain/common";
import { createSourceHash } from "@shared/utils/hashUtils";

/**
 * Converts file and section AI analysis into domain notes.
 *
 * @param analysis - Combined AI file and section analysis.
 * @param sourceLines - Current source file split into lines.
 * @returns Domain file note and section notes.
 *
 * @example
 * const notes = createFileSectionNotesFromAiAnalysis(analysis, ["export {}", ""]);
 */
export function createFileSectionNotesFromAiAnalysis(
  analysis: FileSectionAnalysis,
  sourceLines: string[],
): {
  fileNote: FileNote;
  sectionNotes: SectionNote[];
} {
  return {
    fileNote: createFileNoteFromAiAnalysis(analysis.file),
    sectionNotes: createSectionNotesFromAiAnalysis(analysis.sections, sourceLines),
  };
}

/**
 * Converts file-level AI analysis into a domain file note.
 *
 * @param analysis - AI-generated file analysis.
 * @returns Domain file note ready for storage metadata to be added.
 *
 * @example
 * const note = createFileNoteFromAiAnalysis({ summary: "Reads config.", detail: "Validates config." });
 */
export function createFileNoteFromAiAnalysis(analysis: FileAnalysis): FileNote {
  return {
    id: "file",
    aiExplanation: analysis,
    status: createCurrentConfirmedStatus(),
    createdBy: "ai",
  };
}

/**
 * Converts section AI analysis items into domain section notes.
 *
 * @param analyses - AI-generated section analyses.
 * @param sourceLines - Current source file split into lines.
 * @returns Domain section notes ready for storage metadata to be added.
 *
 * @example
 * const notes = createSectionNotesFromAiAnalysis([section], ["const value = 1;"]);
 */
export function createSectionNotesFromAiAnalysis(
  analyses: SectionAnalysis[],
  sourceLines: string[],
): SectionNote[] {
  return analyses.map((analysis, index) =>
    createSectionNoteFromAiAnalysis(analysis, sourceLines, index),
  );
}

/**
 * Converts one section AI analysis into a domain section note.
 *
 * @param analysis - AI-generated section analysis.
 * @param sourceLines - Current source file split into lines.
 * @param index - Optional zero-based index used to keep generated ids stable when titles repeat.
 * @returns Domain section note ready for storage metadata to be added.
 *
 * @example
 * const note = createSectionNoteFromAiAnalysis(section, ["const value = 1;"]);
 */
export function createSectionNoteFromAiAnalysis(
  analysis: SectionAnalysis,
  sourceLines: string[],
  index = 0,
): SectionNote {
  const sectionSource = getSourceRangeText(sourceLines, analysis.range.startLine, analysis.range.endLine);

  return {
    id: createSectionNoteId(analysis, index),
    title: analysis.title,
    kind: analysis.kind,
    range: analysis.range,
    anchorHash: createSourceHash(sectionSource),
    aiExplanation: {
      summary: analysis.summary,
      detail: analysis.detail,
      aiNotes: analysis.aiNotes,
    },
    status: createCurrentConfirmedStatus(),
    createdBy: "ai",
  };
}

/**
 * Converts batch line AI analysis entries into domain line notes.
 *
 * @param entries - AI-generated batch line analysis entries.
 * @param sourceLines - Current source file split into lines.
 * @returns Domain line notes ready for storage metadata to be added.
 *
 * @example
 * const notes = createLineNotesFromAiBatchAnalysis([{ lineNumber: 1, summary: "Returns.", detail: "Returns value." }], ["return value;"]);
 */
export function createLineNotesFromAiBatchAnalysis(
  entries: LineAnalysisEntry[],
  sourceLines: string[],
): LineNote[] {
  return entries.map((entry) =>
    createLineNoteFromAiAnalysis(entry.lineNumber, entry, sourceLines),
  );
}

/**
 * Converts one line AI analysis into a domain line note.
 *
 * @param lineNumber - One-based source line number.
 * @param analysis - AI-generated line analysis.
 * @param sourceLines - Current source file split into lines.
 * @returns Domain line note ready for storage metadata to be added.
 *
 * @example
 * const note = createLineNoteFromAiAnalysis(1, { summary: "Returns.", detail: "Returns value." }, ["return value;"]);
 */
export function createLineNoteFromAiAnalysis(
  lineNumber: number,
  analysis: LineAnalysis,
  sourceLines: string[],
): LineNote {
  const anchorText = getSourceLineText(sourceLines, lineNumber);

  return {
    id: createLineNoteId(lineNumber),
    line: lineNumber,
    anchorText,
    aiExplanation: {
      summary: analysis.summary,
      detail: analysis.detail,
      aiNotes: analysis.aiNotes,
    },
    status: createCurrentConfirmedStatus(),
    createdBy: "ai",
  };
}

/**
 * Creates a stable domain id for a section note.
 *
 * @param analysis - AI-generated section analysis.
 * @param index - Zero-based index used to avoid collisions for repeated titles and ranges.
 * @returns Stable section note id.
 *
 * @example
 * const id = createSectionNoteId(section, 0);
 */
export function createSectionNoteId(analysis: SectionAnalysis, index: number): string {
  const titleSlug = createIdSlug(analysis.title);

  return `section:${index + 1}:${titleSlug}:${analysis.range.startLine}-${analysis.range.endLine}`;
}

/**
 * Creates a stable domain id for a line note.
 *
 * @param lineNumber - One-based source line number.
 * @returns Stable line note id.
 *
 * @example
 * const id = createLineNoteId(42);
 */
export function createLineNoteId(lineNumber: number): string {
  return `line:${lineNumber}`;
}

/**
 * Reads source text for an inclusive one-based line range.
 *
 * @param sourceLines - Current source file split into lines.
 * @param startLine - One-based inclusive start line.
 * @param endLine - One-based inclusive end line.
 * @returns Source text for the requested line range.
 *
 * @example
 * const text = getSourceRangeText(["a", "b"], 1, 2);
 */
export function getSourceRangeText(
  sourceLines: string[],
  startLine: number,
  endLine: number,
): string {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine) {
    throw new Error("Invalid source range: startLine and endLine must be one-based inclusive integers.");
  }

  if (endLine > sourceLines.length) {
    throw new Error("Invalid source range: endLine exceeds source line count.");
  }

  return sourceLines.slice(startLine - 1, endLine).join("\n");
}

/**
 * Reads source text for one inclusive one-based line number.
 *
 * @param sourceLines - Current source file split into lines.
 * @param lineNumber - One-based line number.
 * @returns Source text for the requested line.
 *
 * @example
 * const text = getSourceLineText(["const value = 1;"], 1);
 */
export function getSourceLineText(sourceLines: string[], lineNumber: number): string {
  if (!Number.isInteger(lineNumber) || lineNumber < 1) {
    throw new Error("Invalid source line: lineNumber must be a one-based integer.");
  }

  if (lineNumber > sourceLines.length) {
    throw new Error("Invalid source line: lineNumber exceeds source line count.");
  }

  return sourceLines[lineNumber - 1] ?? "";
}

/**
 * Creates an id-safe slug from display text.
 *
 * @param value - Display text to convert.
 * @returns Lowercase slug suitable for generated ids.
 *
 * @example
 * const slug = createIdSlug("Load Settings");
 */
function createIdSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "section";
}
