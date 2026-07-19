import { describe, expect, it } from "vitest";

import {
  filterAndSortNavigatorItems,
  matchesGlobalSearch,
  matchesListFilter,
} from "@vscode/webview-ui/src/components/navigatorListUtils";
import type {
  NavigatorFileItem,
  NavigatorLineItem,
  NavigatorSectionItem,
} from "@vscode/webview-ui/src/types";

describe("Navigator list search, filters, and sorting", () => {
  it("searches complete note and resource metadata across item kinds", () => {
    const file = createFile({ userNote: "Authentication entry point" });
    const section = createSection({ kind: "controller", title: "Handle session" });
    const line = createLine({ anchorText: "return currentUser;" });

    expect(matchesGlobalSearch(file, "authentication")).toBe(true);
    expect(matchesGlobalSearch(section, "controller")).toBe(true);
    expect(matchesGlobalSearch(line, "currentuser")).toBe(true);
  });

  it("filters only by the structural fields for the active list", () => {
    const file = createFile({ userNote: "Contains service", relativePath: "src/index.ts" });
    const section = createSection({ kind: "service", title: "Load account" });
    const line = createLine({ line: 10, anchorText: "const fire = true;" });

    expect(matchesListFilter(file, "files", "service")).toBe(false);
    expect(matchesListFilter(file, "files", "index")).toBe(true);
    expect(matchesListFilter(section, "sections", "service")).toBe(true);
    expect(matchesListFilter(line, "lines", "fire")).toBe(true);
    expect(matchesListFilter(line, "lines", "10")).toBe(true);
  });

  it("sorts created timestamps newest first by default semantics", () => {
    const older = createFile({ name: "older.ts", createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = createFile({ name: "newer.ts", createdAt: "2026-02-01T00:00:00.000Z" });

    const result = filterAndSortNavigatorItems(
      [older, newer],
      "files",
      "",
      "",
      { field: "createdAt", direction: "descending" },
    );

    expect(result.map((item) => ("name" in item ? item.name : ""))).toEqual([
      "newer.ts",
      "older.ts",
    ]);
  });

  it("sorts line numbers numerically rather than lexicographically", () => {
    const result = filterAndSortNavigatorItems(
      [createLine({ line: 10 }), createLine({ line: 2 }), createLine({ line: 1 })],
      "lines",
      "",
      "",
      { field: "line", direction: "ascending" },
    );

    expect(result.map((item) => ("line" in item ? item.line : 0))).toEqual([1, 2, 10]);
  });
});

function createFile(input: Partial<NavigatorFileItem> = {}): NavigatorFileItem {
  return {
    name: "index.ts",
    relativePath: input.relativePath ?? "src/index.ts",
    resourceKind: "file",
    preview: "Entry point",
    ...input,
  };
}

function createSection(input: Partial<NavigatorSectionItem> = {}): NavigatorSectionItem {
  return {
    id: "section:1",
    title: "Section",
    startLine: 1,
    endLine: 5,
    preview: "Section note",
    ...input,
  };
}

function createLine(input: Partial<NavigatorLineItem> = {}): NavigatorLineItem {
  return {
    id: `line:${input.line ?? 1}`,
    line: 1,
    anchorText: "return value;",
    preview: "Line note",
    ...input,
  };
}
