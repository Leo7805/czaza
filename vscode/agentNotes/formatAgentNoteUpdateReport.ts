/**
 * Formats structured AI Agent note update results for concise user-facing output.
 */

import type {
  AgentNoteChangeResult,
  AgentNoteUpdateReport,
} from "./agentNoteTypes";

/**
 * Formats an Agent Note update report by source file with one line per result.
 *
 * @param report - Structured result returned by `applyAgentNoteUpdates`.
 * @returns Plain-text report containing file groups and aggregate totals.
 */
export function formatAgentNoteUpdateReport(report: AgentNoteUpdateReport): string {
  const sections = report.files
    .filter((file) => file.changes.length > 0)
    .map((file) => [
      file.sourcePath,
      ...file.changes.map(formatChange),
    ].join("\n"));
  const summary = [
    "Summary",
    `- Files changed: ${report.summary.filesChanged}`,
    `- Notes updated: ${report.summary.updated}`,
    `- Notes created: ${report.summary.created}`,
    `- Changes skipped: ${report.summary.skipped}`,
    `- Changes failed: ${report.summary.failed}`,
  ].join("\n");

  return ["Note update results", `Current Notes: ${report.owner.label}`, ...sections, summary].join("\n\n");
}

/**
 * Formats one note result as a single readable list item.
 *
 * @param change - One structured note update result.
 * @returns One line containing action, note identity, and reason.
 */
function formatChange(change: AgentNoteChangeResult): string {
  const action = getActionLabel(change.action);
  const level = getLevelLabel(change.noteLevel);
  const identity = change.title ?? change.noteId;
  const target = identity ? `${level} (${identity})` : level;

  return `- ${action} ${target}: ${collapseToOneLine(change.reason)}`;
}

/** Returns the user-facing verb for one result action. */
function getActionLabel(action: AgentNoteChangeResult["action"]): string {
  switch (action) {
    case "updated": return "Updated";
    case "created": return "Created";
    case "skipped": return "Skipped";
    case "failed": return "Failed";
  }
}

/** Returns the user-facing name for one note attachment level. */
function getLevelLabel(level: AgentNoteChangeResult["noteLevel"]): string {
  switch (level) {
    case "file": return "File Note";
    case "section": return "Section Note";
    case "line": return "Line Note";
  }
}

/** Collapses whitespace so one report item always occupies one text line. */
function collapseToOneLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
