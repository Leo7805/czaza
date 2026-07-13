/**
 * Domain models for meaningful code sections.
 */

import type { SectionDefinition } from "@shared/models/common";
import type { AIExplanation } from "@shared/models/ai/common";
import type { DomainNoteFields } from "./common";

/**
 * A persistent note attached to a meaningful code section.
 *
 * A section may be created manually by the user
 * or generated from an AI section analysis.
 *
 * @example
 * const note: SectionNote = {
 *   id: "section:deepseek-request:24-58",
 *   title: "DeepSeek request setup",
 *   kind: "network-request",
 *   range: {
 *     startLine: 24,
 *     endLine: 58,
 *   },
 *   anchorHash: "sha256:abc123",
 *   aiExplanation: {
 *     summary: "Builds and sends the DeepSeek request.",
 *     detail: "This section prepares headers, request body, timeout handling, and response parsing.",
 *   },
 *   status: {
 *     content: "current",
 *     anchor: "confirmed",
 *   },
 *   createdBy: "ai",
 * };
 */
export type SectionNote = SectionDefinition &
  DomainNoteFields<AIExplanation> & {
    /**
     * Stable identifier for the section note.
     *
     * @example
     * "section:deepseek-request:24-58"
     */
    id: string;

    /**
     * Hash of the source text covered by the section when the anchor was confirmed.
     *
     * @example
     * "sha256:abc123"
     */
    anchorHash: string;

    /**
     * How the section was originally created.
     *
     * @example
     * "ai"
     */
    createdBy: "user" | "ai";
  };
