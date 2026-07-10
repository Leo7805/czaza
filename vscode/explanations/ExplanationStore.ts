import * as vscode from "vscode";
import type { CodeExplanation } from "@shared/types/codeExplanation";
import type { LineUnit } from "@shared/types/lineUnit";
import type { SemanticUnit } from "@shared/types/semanticUnit";

export type FileExplanationState = {
  fileStructure?: CodeExplanation;
  semanticUnits: SemanticUnit[];
  lineUnitsByLine: Map<number, LineUnit>;
};

export class ExplanationStore {
  private readonly stateByUri = new Map<string, FileExplanationState>();

  get(uri: vscode.Uri): FileExplanationState | undefined {
    return this.stateByUri.get(getUriKey(uri));
  }

  setState(uri: vscode.Uri, state: FileExplanationState) {
    this.stateByUri.set(getUriKey(uri), state);
  }

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

  setFileStructure(uri: vscode.Uri, explanation: CodeExplanation) {
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

  setSemanticUnits(uri: vscode.Uri, semanticUnits: SemanticUnit[]) {
    const state = this.ensure(uri);
    state.semanticUnits = semanticUnits;

    if (state.fileStructure) {
      state.fileStructure = {
        ...state.fileStructure,
        semanticUnits,
      };
    }
  }

  addLineUnits(uri: vscode.Uri, lineUnits: LineUnit[]) {
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
