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
 */

export type SectionNote = SectionDefinition &
  DomainNoteFields<AIExplanation> & {
    /** Stable identifier for the section note. */
    id: string;

    /** How the section was originally created. */
    createdBy: "user" | "ai";
  };
