/** Renders compact status badges for stale or displaced notes. */

import type { NoteAnchorStatus, NoteStatus } from "../types";
import { Tooltip } from "./Tooltip";

type StatusBadge = {
  key: string;
  label: string;
  tone: "stale" | NoteAnchorStatus;
  tooltip: string;
};

/**
 * Shows one or more note status badges.
 *
 * Normal notes with current content and a confirmed anchor render nothing.
 */
export function NoteStatusBadges({
  status,
}: {
  status?: NoteStatus;
}) {
  const badges = getStatusBadges(status);

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

function getStatusBadges(status: NoteStatus | undefined): StatusBadge[] {
  if (!status) {
    return [];
  }

  const badges: StatusBadge[] = [];

  if (status.content === "stale") {
    badges.push({
      key: "content:stale",
      label: "Stale",
      tone: "stale",
      tooltip: "The source changed after this note was written. Review or regenerate it.",
    });
  }

  if (status.anchor === "needsConfirmation") {
    badges.push({
      key: "anchor:needsConfirmation",
      label: "Needs confirmation",
      tone: "needsConfirmation",
      tooltip: "CZaza could not confirm this note still points to the right resource. Review the target.",
    });
  }

  if (status.anchor === "orphaned") {
    badges.push({
      key: "anchor:orphaned",
      label: "Orphaned",
      tone: "orphaned",
      tooltip: "The original resource was deleted or is no longer available.",
    });
  }

  return badges;
}
