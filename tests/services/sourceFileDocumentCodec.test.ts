/**
 * Unit tests for compact source-file note document encoding.
 */

import { describe, expect, it } from "vitest";
import type { SourceFileDocument } from "@shared/models/store/sourceFileDocument";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  decodeSourceFileDocument,
  encodeSourceFileDocument,
} from "@shared/services/sourceFileDocumentCodec";

const commonTime = "2026-07-21T03:50:28.604Z";
const overrideTime = "2026-07-21T04:10:00.000Z";

describe("sourceFileDocumentCodec", () => {
  it("round-trips complete note data through the compact document", () => {
    const sourceFile = createStoredSourceFile();
    const encoded = encodeSourceFileDocument(sourceFile);

    expect(decodeSourceFileDocument(encoded)).toEqual(sourceFile);
  });

  it("omits defaults and stores stable note ids as collection keys", () => {
    const encoded = encodeSourceFileDocument(createStoredSourceFile());

    expect(encoded).toMatchObject({
      defaults: {
        createdAt: commonTime,
        updatedAt: commonTime,
      },
    });
    expect(encoded.fileNote).not.toHaveProperty("id");
    expect(encoded.fileNote).not.toHaveProperty("createdBy");
    expect(encoded.fileNote).not.toHaveProperty("status");
    expect(encoded.lineNotes).toHaveProperty("line:12");
    expect(encoded.lineNotes).toHaveProperty("line:12:note:1");
    expect(encoded.lineNotes["line:12"]).not.toHaveProperty("id");
    expect(encoded.lineNotes["line:12"]).toMatchObject({ line: 20 });
    expect(encoded.lineNotes["line:12:note:1"]).toMatchObject({
      line: 20,
      createdBy: "user",
      createdAt: overrideTime,
      updatedAt: overrideTime,
      status: {
        content: "stale",
        anchor: "needsConfirmation",
      },
    });
  });

  it("rejects compact notes without resolvable timestamps", () => {
    expect(decodeSourceFileDocument({
      source: { sourceHash: "sha256:source" },
      sectionNotes: {},
      lineNotes: {
        "line:1": {
          line: 1,
          anchorText: "const value = 1;",
        },
      },
    } satisfies SourceFileDocument)).toBeUndefined();
  });
});

/** Creates a fixture covering defaults, overrides, moved notes, and duplicate lines. */
function createStoredSourceFile(): StoredSourceFile {
  return {
    source: {
      sourceHash: "sha256:source",
      sourceHashKind: "text",
      programmingLanguage: "typescript",
    },
    fileNote: {
      id: "file",
      aiExplanation: {
        summary: "File summary.",
        detail: "File detail.",
      },
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "ai",
      createdAt: commonTime,
      updatedAt: commonTime,
    },
    sectionNotes: [
      {
        id: "section:example:10-20",
        title: "Example",
        kind: "function",
        range: { startLine: 10, endLine: 20 },
        anchorHash: "sha256:section",
        userNote: "Keep this section.",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "ai",
        createdAt: commonTime,
        updatedAt: commonTime,
      },
    ],
    lineNotes: [
      {
        id: "line:12",
        line: 20,
        anchorText: "const value = 1;",
        aiExplanation: {
          summary: "Creates a value.",
          detail: "The line initializes a local constant.",
        },
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "ai",
        createdAt: commonTime,
        updatedAt: commonTime,
      },
      {
        id: "line:12:note:1",
        line: 20,
        anchorText: "const value = 1;",
        userNote: "User explanation.",
        status: {
          content: "stale",
          anchor: "needsConfirmation",
        },
        createdBy: "user",
        createdAt: overrideTime,
        updatedAt: overrideTime,
      },
    ],
  };
}
