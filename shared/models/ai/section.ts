/**
 * AI-generated analysis models for meaningful code sections.
 */

import type { SectionDefinition } from "@shared/models/common";
import type { AIExplanation } from "./common";

/**
 * AI-generated analysis for one meaningful code section.
 */
export type SectionAnalysis = SectionDefinition & AIExplanation;
