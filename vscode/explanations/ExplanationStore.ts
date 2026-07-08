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
    state.fileStructure = explanation;
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
      state.lineUnitsByLine.set(lineUnit.lineNumber, lineUnit);
    }
  }
}

function getUriKey(uri: vscode.Uri): string {
  return uri.toString();
}
