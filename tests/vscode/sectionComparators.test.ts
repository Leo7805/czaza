/** Tests for independent Section Notes display and automatic-selection ordering. */

import { describe, expect, it } from "vitest";

import {
  compareSectionsForAutomaticSelection,
  compareSectionsForDisplay,
  type ComparableSection,
} from "@vscode/services/sectionSelection/sectionComparators";

describe("compareSectionsForDisplay()", () => {
  it("orders by start, end, title, oldest creation time, and stable id", () => {
    const sections = [
      section("same-new", "Alpha", 1, 10, "2026-01-02T00:00:00.000Z"),
      section("later", "Earlier title", 2, 3, "2026-01-01T00:00:00.000Z"),
      section("same-old-z", "Alpha", 1, 10, "2026-01-01T00:00:00.000Z"),
      section("short", "Zulu", 1, 5, "2026-01-01T00:00:00.000Z"),
      section("beta", "Beta", 1, 10, "2026-01-01T00:00:00.000Z"),
      section("same-old-a", "Alpha", 1, 10, "2026-01-01T00:00:00.000Z"),
    ];

    expect(sections.sort(compareSectionsForDisplay).map(({ id }) => id)).toEqual([
      "short",
      "same-old-a",
      "same-old-z",
      "same-new",
      "beta",
      "later",
    ]);
  });
});

describe("compareSectionsForAutomaticSelection()", () => {
  it("prefers the smallest range, earliest start, newest creation time, and stable id", () => {
    const sections = [
      section("large", "Large", 1, 20, "2026-01-03T00:00:00.000Z"),
      section("same-size-later-start", "Later", 5, 9, "2026-01-04T00:00:00.000Z"),
      section("old-z", "Old", 3, 7, "2026-01-01T00:00:00.000Z"),
      section("new", "New", 3, 7, "2026-01-02T00:00:00.000Z"),
      section("old-a", "Old", 3, 7, "2026-01-01T00:00:00.000Z"),
    ];

    expect(sections.sort(compareSectionsForAutomaticSelection).map(({ id }) => id)).toEqual([
      "new",
      "old-a",
      "old-z",
      "same-size-later-start",
      "large",
    ]);
  });
});

function section(
  id: string,
  title: string,
  startLine: number,
  endLine: number,
  createdAt: string,
): ComparableSection {
  return { id, title, startLine, endLine, createdAt };
}
