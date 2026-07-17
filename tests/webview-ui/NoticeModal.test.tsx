/** Tests reusable webview notice modal markup. */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NoticeModal } from "@vscode/webview-ui/src/components/NoticeModal";

describe("NoticeModal", () => {
  it("renders warning confirmations with two actions", () => {
    const markup = renderToStaticMarkup(
      <NoticeModal
        tone="warning"
        title="Generate All Notes"
        message="This may take longer and use more AI tokens."
        actions={[
          { label: "Cancel", variant: "secondary", onClick: vi.fn() },
          { label: "Generate All Notes", variant: "primary", onClick: vi.fn() },
        ]}
      />,
    );

    expect(markup).toContain("notice-modal--warning");
    expect(markup).toContain("Generate All Notes");
    expect(markup).toContain("This may take longer and use more AI tokens.");
    expect(markup).toContain("Cancel");
  });

  it("renders single-action error notices", () => {
    const markup = renderToStaticMarkup(
      <NoticeModal
        tone="error"
        title="Note Target Not Found"
        message="The file may have been renamed, moved, or deleted outside VS Code."
        actions={[{ label: "Close", variant: "primary", onClick: vi.fn() }]}
      />,
    );

    expect(markup).toContain("notice-modal--error");
    expect(markup).toContain("Note Target Not Found");
    expect(markup).toContain("Close");
  });
});
