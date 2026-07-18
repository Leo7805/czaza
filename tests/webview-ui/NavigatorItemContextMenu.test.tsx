/** Tests shared Navigator item context menu markup. */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NavigatorItemContextMenu } from "@vscode/webview-ui/src/components/NavigatorItemContextMenu";

describe("NavigatorItemContextMenu", () => {
  it("renders shared status and file-note actions", () => {
    const markup = renderToStaticMarkup(
      <NavigatorItemContextMenu
        position={{ x: 10, y: 20 }}
        items={[
          {
            id: "viewNotes",
            label: "View Notes",
            onSelect: vi.fn(),
          },
          {
            id: "clearStale",
            label: "Clear Stale Status: Content Reviewed",
            onSelect: vi.fn(),
          },
          {
            id: "relocate",
            label: "Relocate...",
            onSelect: vi.fn(),
          },
          {
            id: "markOrphaned",
            label: "Mark as Orphaned...",
            onSelect: vi.fn(),
          },
          {
            id: "delete",
            label: "Delete Notes...",
            onSelect: vi.fn(),
          },
        ]}
        onClose={vi.fn()}
      />,
    );

    expect(markup).toContain("navigator-context-menu");
    expect(markup).toContain("View Notes");
    expect(markup).toContain("Clear Stale Status: Content Reviewed");
    expect(markup).toContain("Relocate...");
    expect(markup).toContain("Mark as Orphaned...");
    expect(markup).toContain("Delete Notes...");
  });
});
