/** Renders compact status badges for stale or displaced notes. */

import type { NoteAnchorStatus, NoteStatus } from "../types";
import { Tooltip } from "./Tooltip";

type StatusBadge = {
  key: string;
  label: string;
  tone: "stale" | NoteAnchorStatus;
  tooltip: string;
};

export type NoteStatusBadgeScope = "file" | "section" | "line" | "default";

/**
 * Shows one or more note status badges.
 *
 * Normal notes with current content and a confirmed anchor render nothing.
 */
export function NoteStatusBadges({
  status,
  scope = "default",
}: {
  status?: NoteStatus;
  scope?: NoteStatusBadgeScope;
}) {
  const badges = getStatusBadges(status, scope);

  if (badges.length === 0) {
    return null;
  }

  return (
    <span className="note-status-badges" aria-label="Note status">
      {badges.map((badge) => (
        <Tooltip align="end" content={badge.tooltip} key={badge.key}>
          <span className={`note-status-badge note-status-badge--${badge.tone}`}>
            {badge.label}
          </span>
        </Tooltip>
      ))}
    </span>
  );
}

function getStatusBadges(status: NoteStatus | undefined, scope: NoteStatusBadgeScope): StatusBadge[] {
  if (!status) {
    return [];
  }

  const badges: StatusBadge[] = [];

  if (status.content === "stale") {
    badges.push({
      key: "content:stale",
      label: scope === "default" ? "Stale" : "Content stale",
      tone: "stale",
      tooltip: getContentStaleTooltip(scope),
    });
  }

  if (status.anchor === "needsConfirmation") {
    badges.push({
      key: "anchor:needsConfirmation",
      label: scope === "default" ? "Needs confirmation" : "Location review",
      tone: "needsConfirmation",
      tooltip: getLocationReviewTooltip(scope),
    });
  }

  if (status.anchor === "orphaned") {
    badges.push({
      key: "anchor:orphaned",
      label: "Orphaned",
      tone: "orphaned",
      tooltip: getOrphanedTooltip(scope),
    });
  }

  return badges;
}

function getContentStaleTooltip(scope: NoteStatusBadgeScope): string {
  if (scope === "file") {
    return "The file note content may no longer match the current file. Review or regenerate it.";
  }

  if (scope === "section") {
    return "The section note content may no longer match the current section. Review or regenerate it.";
  }

  if (scope === "line") {
    return "The line note content may no longer match the current line. Review or regenerate it.";
  }

  return "The source changed after this note was written. Review or regenerate it.";
}

function getLocationReviewTooltip(scope: NoteStatusBadgeScope): string {
  if (scope === "file") {
    return "CZaza cannot confirm this file note still points to the intended file. Relocate or review the target.";
  }

  if (scope === "section") {
    return "CZaza cannot confirm this section note still points to the intended code section. Relocate or review the target.";
  }

  if (scope === "line") {
    return "CZaza cannot confirm this line note still points to the intended source line. Relocate or review the target.";
  }

  return "CZaza could not confirm this note still points to the right resource. Review the target.";
}

function getOrphanedTooltip(scope: NoteStatusBadgeScope): string {
  if (scope === "file") {
    return "This file note is not attached to an available source file.";
  }

  if (scope === "section") {
    return "This section note is not attached to an available code section.";
  }

  if (scope === "line") {
    return "This line note is not attached to an available source line.";
  }

  return "The original resource was deleted or is no longer available.";
}
