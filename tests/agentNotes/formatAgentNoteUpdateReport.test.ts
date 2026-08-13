/**
 * Verifies user-facing formatting of structured AI Agent note update reports.
 */

import { describe, expect, it } from "vitest";

import type { AgentNoteUpdateReport } from "@vscode/agentNotes/agentNoteTypes";
import { formatAgentNoteUpdateReport } from "@vscode/agentNotes/formatAgentNoteUpdateReport";

describe("formatAgentNoteUpdateReport", () => {
  it("groups changes by source file and formats each change on one line", () => {
    const report: AgentNoteUpdateReport = {
      owner: { kind: "team", label: "Team Notes" },
      files: [
        {
          sourcePath: "src/order.ts",
          changes: [
            { action: "updated", noteLevel: "section", noteId: "section:create", title: "createOrder", reason: "Added inventory\nchecks." },
            { action: "created", noteLevel: "line", noteId: "line:12", reason: "The return value now matters." },
          ],
        },
        {
          sourcePath: "src/model.ts",
          changes: [{ action: "updated", noteLevel: "file", noteId: "file", reason: "Added the cancelled state." }],
        },
      ],
      summary: { filesChanged: 2, updated: 2, created: 1, skipped: 0, failed: 0 },
    };

    expect(formatAgentNoteUpdateReport(report)).toBe([
      "Note update results",
      "",
      "Current Notes: Team Notes",
      "",
      "src/order.ts",
      "- Updated Section Note (createOrder): Added inventory checks.",
      "- Created Line Note (line:12): The return value now matters.",
      "",
      "src/model.ts",
      "- Updated File Note (file): Added the cancelled state.",
      "",
      "Summary",
      "- Files changed: 2",
      "- Notes updated: 2",
      "- Notes created: 1",
      "- Changes skipped: 0",
      "- Changes failed: 0",
    ].join("\n"));
  });

  it("includes skipped and failed results with their reasons", () => {
    const report: AgentNoteUpdateReport = {
      owner: { kind: "personal", memberId: "leo-12345678", displayName: "Leo", label: "Personal Notes — Leo" },
      files: [{
        sourcePath: "src/value.ts",
        changes: [
          { action: "skipped", noteLevel: "file", noteId: "file", reason: "AI explanation is unchanged." },
          { action: "failed", noteLevel: "section", noteId: "missing", reason: "Note ID was not found." },
        ],
      }],
      summary: { filesChanged: 0, updated: 0, created: 0, skipped: 1, failed: 1 },
    };

    const formatted = formatAgentNoteUpdateReport(report);

    expect(formatted).toContain("- Skipped File Note (file): AI explanation is unchanged.");
    expect(formatted).toContain("Current Notes: Personal Notes — Leo");
    expect(formatted).toContain("- Failed Section Note (missing): Note ID was not found.");
    expect(formatted).toContain("- Changes skipped: 1");
    expect(formatted).toContain("- Changes failed: 1");
  });

  it("formats an empty report with only zero totals", () => {
    const report: AgentNoteUpdateReport = {
      owner: { kind: "team", label: "Team Notes" },
      files: [],
      summary: { filesChanged: 0, updated: 0, created: 0, skipped: 0, failed: 0 },
    };

    expect(formatAgentNoteUpdateReport(report)).toBe([
      "Note update results",
      "",
      "Current Notes: Team Notes",
      "",
      "Summary",
      "- Files changed: 0",
      "- Notes updated: 0",
      "- Notes created: 0",
      "- Changes skipped: 0",
      "- Changes failed: 0",
    ].join("\n"));
  });
});
