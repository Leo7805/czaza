/**
 * Stores legacy explanation results for the current VS Code extension session.
 */

import * as vscode from "vscode";
import type { CodeExplanation } from "@shared/types/codeExplanation";
import type { LineUnit } from "@shared/types/lineUnit";
import type { SemanticUnit } from "@shared/types/semanticUnit";

/**
 * In-memory explanation state for one source file.
 *
 * @example
 * const state: FileExplanationState = {
 *   semanticUnits: [],
 *   lineUnitsByLine: new Map(),
 * };
 */
export type FileExplanationState = {
  fileStructure?: CodeExplanation;
  semanticUnits: SemanticUnit[];
  lineUnitsByLine: Map<number, LineUnit>;
};

/**
 * Keeps legacy file, semantic, and line explanation data in memory.
 *
 * This store does not write files by itself. Persistence is handled by
 * {@link ExplanationCache}, which can load cached JSON into this store and
 * save this store's current state back to disk.
 *
 * @example
 * const store = new ExplanationStore();
 * const state = store.ensure(document.uri);
 */
export class ExplanationStore {
  private readonly stateByUri = new Map<string, FileExplanationState>();

  /**
   * Reads the explanation state for one URI.
   *
   * @param uri - VS Code resource URI.
   * @returns Existing explanation state, or undefined when the URI has not been analyzed.
   *
   * @example
   * const state = store.get(document.uri);
   */
  get(uri: vscode.Uri): FileExplanationState | undefined {
    return this.stateByUri.get(getUriKey(uri));
  }

  /**
   * Replaces the explanation state for one URI.
   *
   * @param uri - VS Code resource URI.
   * @param state - Complete explanation state to store.
   *
   * @example
   * store.setState(document.uri, { semanticUnits: [], lineUnitsByLine: new Map() });
   */
  setState(uri: vscode.Uri, state: FileExplanationState): void {
    this.stateByUri.set(getUriKey(uri), state);
  }

  /**
   * Reads or creates the explanation state for one URI.
   *
   * @param uri - VS Code resource URI.
   * @returns Existing or newly created explanation state.
   *
   * @example
   * const state = store.ensure(document.uri);
   */
  ensure(uri: vscode.Uri): FileExplanationState {
    const key = getUriKey(uri);
    const existing = this.stateByUri.get(key);

    if (existing) {
      return existing;
    }

    const next: FileExplanationState = {
      semanticUnits: [],
      lineUnitsByLine: new Map(),
    };

    this.stateByUri.set(key, next);
    return next;
  }

  /**
   * Stores a file-level structure explanation while preserving existing user notes.
   *
   * @param uri - VS Code resource URI.
   * @param explanation - New AI-generated file structure explanation.
   *
   * @example
   * store.setFileStructure(document.uri, explanation);
   */
  setFileStructure(uri: vscode.Uri, explanation: CodeExplanation): void {
    const state = this.ensure(uri);
    const previousById = new Map(
      (state.fileStructure?.structureUnits ?? []).map((unit) => [
        unit.id,
        unit.explanation.userNotes ?? [],
      ]),
    );

    state.fileStructure = {
      ...explanation,
      structureUnits: explanation.structureUnits.map((unit) => {
        const userNotes = previousById.get(unit.id);

        if (!userNotes || userNotes.length === 0) {
          return unit;
        }

        return {
          ...unit,
          explanation: {
            ...unit.explanation,
            userNotes,
          },
        };
      }),
    };
  }

  /**
   * Stores semantic explanations for one URI.
   *
   * @param uri - VS Code resource URI.
   * @param semanticUnits - AI-generated semantic explanation units.
   *
   * @example
   * store.setSemanticUnits(document.uri, semanticUnits);
   */
  setSemanticUnits(uri: vscode.Uri, semanticUnits: SemanticUnit[]): void {
    const state = this.ensure(uri);
    state.semanticUnits = semanticUnits;

    if (state.fileStructure) {
      state.fileStructure = {
        ...state.fileStructure,
        semanticUnits,
      };
    }
  }

  /**
   * Adds or replaces line explanations while preserving existing line user notes.
   *
   * @param uri - VS Code resource URI.
   * @param lineUnits - AI-generated line explanation units.
   *
   * @example
   * store.addLineUnits(document.uri, lineUnits);
   */
  addLineUnits(uri: vscode.Uri, lineUnits: LineUnit[]): void {
    const state = this.ensure(uri);

    for (const lineUnit of lineUnits) {
      const userNotes = state.lineUnitsByLine.get(lineUnit.lineNumber)?.explanation.userNotes ?? [];
      state.lineUnitsByLine.set(lineUnit.lineNumber, {
        ...lineUnit,
        explanation: {
          ...lineUnit.explanation,
          userNotes,
        },
      });
    }
  }

  /**
   * Replaces user notes on one structure explanation.
   *
   * @param uri - VS Code resource URI.
   * @param structureId - Structure unit id.
   * @param userNotes - User-authored notes to store.
   * @returns True when the structure unit exists and was updated.
   *
   * @example
   * const updated = store.setStructureUserNotes(document.uri, "function:main", ["Important"]);
   */
  setStructureUserNotes(uri: vscode.Uri, structureId: string, userNotes: string[]): boolean {
    const structureUnits = this.get(uri)?.fileStructure?.structureUnits;
    const structureUnit = structureUnits?.find((unit) => unit.id === structureId);

    if (!structureUnit) {
      return false;
    }

    structureUnit.explanation = {
      ...structureUnit.explanation,
      userNotes,
    };
    return true;
  }

  /**
   * Replaces user notes on one line explanation, creating a placeholder when needed.
   *
   * @param uri - VS Code resource URI.
   * @param lineNumber - One-based source line number.
   * @param userNotes - User-authored notes to store.
   * @param code - Source text for the line when no explanation exists yet.
   * @returns True when the line note was stored.
   *
   * @example
   * store.setLineUserNotes(document.uri, 12, ["Check this branch"], "return value;");
   */
  setLineUserNotes(
    uri: vscode.Uri,
    lineNumber: number,
    userNotes: string[],
    code: string,
  ): boolean {
    const state = this.ensure(uri);
    const existing = state.lineUnitsByLine.get(lineNumber);

    if (existing) {
      existing.explanation = {
        ...existing.explanation,
        userNotes,
      };
      return true;
    }

    state.lineUnitsByLine.set(lineNumber, {
      lineNumber,
      code,
      explanation: {
        summary: "",
        detail: "",
        userNotes,
      },
    });
    return true;
  }
}

function getUriKey(uri: vscode.Uri): string {
  return uri.toString();
}
