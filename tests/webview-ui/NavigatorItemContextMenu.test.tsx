/** Tests shared Navigator item context menu markup. */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NavigatorItemContextMenu } from "@vscode/webview-ui/src/components/NavigatorItemContextMenu";

describe("NavigatorItemContextMenu", () => {
  it("renders shared status and placeholder actions", () => {
    const markup = renderToStaticMarkup(
      <NavigatorItemContextMenu
        position={{ x: 10, y: 20 }}
        items={[
          {
            id: "clearStale",
            label: "Clear Stale Status: Content Reviewed",
            onSelect: vi.fn(),
          },
          {
            id: "relocate",
            label: "Resolve Anchor: Relocate...",
            disabled: true,
          },
          {
            id: "delete",
            label: "Delete",
            disabled: true,
          },
        ]}
        onClose={vi.fn()}
      />,
    );

    expect(markup).toContain("navigator-context-menu");
    expect(markup).toContain("Clear Stale Status: Content Reviewed");
    expect(markup).toContain("Resolve Anchor: Relocate...");
    expect(markup).toContain("Delete");
  });
});
