/** Pure search, filter, and sorting helpers for Navigator lists. */

import type {
  NavigatorFileItem,
  NavigatorLineItem,
  NavigatorSectionItem,
} from "../types";

export type NavigatorListTab = "files" | "sections" | "lines";
export type NavigatorSortDirection = "ascending" | "descending";
export type NavigatorSortField = "name" | "title" | "line" | "createdAt" | "updatedAt";
export type NavigatorListItem = NavigatorFileItem | NavigatorSectionItem | NavigatorLineItem;

export type NavigatorSortState = {
  field: NavigatorSortField;
  direction: NavigatorSortDirection;
};

export const defaultNavigatorSort: Record<NavigatorListTab, NavigatorSortState> = {
  files: { field: "createdAt", direction: "descending" },
  sections: { field: "createdAt", direction: "descending" },
  lines: { field: "createdAt", direction: "descending" },
};

export function filterAndSortNavigatorItems(
  items: NavigatorListItem[],
  tab: NavigatorListTab,
  globalQuery: string,
  filterQuery: string,
  sort: NavigatorSortState,
): NavigatorListItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => matchesGlobalSearch(item, globalQuery))
    .filter(({ item }) => matchesListFilter(item, tab, filterQuery))
    .sort((left, right) => {
      const compared = compareItems(left.item, right.item, sort);
      return compared || left.index - right.index;
    })
    .map(({ item }) => item);
}

export function matchesGlobalSearch(item: NavigatorListItem, query: string): boolean {
  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return true;
  }

  return normalize(getGlobalSearchText(item)).includes(normalizedQuery);
}

export function matchesListFilter(
  item: NavigatorListItem,
  tab: NavigatorListTab,
  query: string,
): boolean {
  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return true;
  }

  return normalize(getFilterText(item, tab)).includes(normalizedQuery);
}

function getGlobalSearchText(item: NavigatorListItem): string {
  const common = [
    item.preview,
    item.userNote,
    item.aiExplanation?.summary,
    item.aiExplanation?.detail,
    ...(item.aiExplanation?.aiNotes ?? []),
  ];

  if ("relativePath" in item) {
    return [...common, item.name, item.relativePath].join("\n");
  }

  if ("startLine" in item) {
    return [...common, item.title, item.kind, `L${item.startLine}-${item.endLine}`].join("\n");
  }

  return [...common, item.anchorText, String(item.line), `Line ${item.line}`].join("\n");
}

function getFilterText(item: NavigatorListItem, tab: NavigatorListTab): string {
  if (tab === "files" && "relativePath" in item) {
    return `${item.name}\n${item.relativePath}`;
  }

  if (tab === "sections" && "startLine" in item) {
    return `${item.title}\n${item.kind ?? ""}`;
  }

  if (tab === "lines" && "line" in item) {
    return `${item.line}\nLine ${item.line}\n${item.anchorText}`;
  }

  return "";
}

function compareItems(
  left: NavigatorListItem,
  right: NavigatorListItem,
  sort: NavigatorSortState,
): number {
  let result = 0;

  if (sort.field === "name") {
    result = compareText(getFileSortName(left), getFileSortName(right));
  } else if (sort.field === "title") {
    result = compareText(getSectionTitle(left), getSectionTitle(right));
  } else if (sort.field === "line") {
    result = getLineNumber(left) - getLineNumber(right);
  } else {
    result = compareOptionalText(left[sort.field], right[sort.field]);

    if (!left[sort.field] || !right[sort.field]) {
      return result;
    }
  }

  return sort.direction === "descending" ? -result : result;
}

function compareOptionalText(left: string | undefined, right: string | undefined): number {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  return compareText(left, right);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function getFileSortName(item: NavigatorListItem): string {
  return "relativePath" in item ? item.relativePath : "";
}

function getSectionTitle(item: NavigatorListItem): string {
  return "startLine" in item ? item.title : "";
}

function getLineNumber(item: NavigatorListItem): number {
  return "line" in item ? item.line : 0;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}
