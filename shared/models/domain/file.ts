/**
 * Domain note models for an entire source file.
 */

import type { FileAnalysis } from "@shared/models/ai/file";
import type { DomainNoteFields } from "./common";

/**
 * A persistent note attached to an entire source file.
 *
 * The user note and AI explanation are independent and optional.
 */
export type FileNote = DomainNoteFields<FileAnalysis>;
