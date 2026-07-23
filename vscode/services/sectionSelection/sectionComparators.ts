/** Deterministic ordering rules for overlapping section notes. */

export type ComparableSection = {
  id: string;
  title: string;
  startLine: number;
  endLine: number;
  createdAt?: string;
};

const sectionTitleCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "variant",
});

/** Orders the section dropdown by source position, title, and creation order. */
export function compareSectionsForDisplay(
  left: ComparableSection,
  right: ComparableSection,
): number {
  return (
    left.startLine - right.startLine ||
    left.endLine - right.endLine ||
    sectionTitleCollator.compare(left.title, right.title) ||
    compareCreatedAtAscending(left.createdAt, right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

/** Chooses the most specific section, preferring newer notes after range ties. */
export function compareSectionsForAutomaticSelection(
  left: ComparableSection,
  right: ComparableSection,
): number {
  return (
    getSectionRangeSize(left) - getSectionRangeSize(right) ||
    left.startLine - right.startLine ||
    compareCreatedAtDescending(left.createdAt, right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function getSectionRangeSize(section: ComparableSection): number {
  return section.endLine - section.startLine + 1;
}

function compareCreatedAtAscending(left?: string, right?: string): number {
  return (left ?? "").localeCompare(right ?? "");
}

function compareCreatedAtDescending(left?: string, right?: string): number {
  return (right ?? "").localeCompare(left ?? "");
}
