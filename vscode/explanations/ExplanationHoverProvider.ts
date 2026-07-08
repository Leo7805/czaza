import * as vscode from "vscode";
import type { ExplanationBlock } from "@shared/types/common";
import type { LineUnit } from "@shared/types/lineUnit";
import type { SemanticUnit } from "@shared/types/semanticUnit";
import type { StructureUnit } from "@shared/types/structureUnit";
import { ExplanationStore } from "./ExplanationStore";

export class ExplanationHoverProvider implements vscode.HoverProvider {
  private readonly store: ExplanationStore;

  constructor(store: ExplanationStore) {
    this.store = store;
  }

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
    if (document.uri.scheme !== "file") {
      return undefined;
    }

    const state = this.store.get(document.uri);
    const lineNumber = position.line + 1;
    const markdown = new vscode.MarkdownString(undefined, true);
    markdown.isTrusted = true;
    markdown.supportHtml = false;

    if (!state?.fileStructure) {
      markdown.appendMarkdown(
        `$(sparkle) No CZaza AI explanation yet. ${commandLink("Analyze file", "czaza.analyzeFileStructure", {
          uri: document.uri.toString(),
        })}`,
      );
      return new vscode.Hover(markdown);
    }

    const structureUnits = state.fileStructure.structureUnits.filter((unit) =>
      includesLine(unit.range, lineNumber),
    );
    const semanticUnits = state.semanticUnits.filter((unit) => includesLine(unit.range, lineNumber));
    const lineUnit = state.lineUnitsByLine.get(lineNumber);

    appendSection(
      markdown,
      "Structure",
      structureUnits.length > 0
        ? structureUnits.map(renderStructureUnit).join("\n\n")
        : `No structure explanation for this line.`,
    );
    appendSection(
      markdown,
      "Semantic",
      semanticUnits.length > 0
        ? semanticUnits.map(renderSemanticUnit).join("\n\n")
        : `No semantic explanation yet. ${commandLink("Analyze semantic", "czaza.analyzeSemantic", {
            uri: document.uri.toString(),
          })}`,
    );
    appendSection(
      markdown,
      "Line",
      lineUnit
        ? renderExplanation(lineUnit.explanation)
        : `No line explanation yet. ${commandLink("Analyze nearby lines", "czaza.analyzeLineRange", {
            uri: document.uri.toString(),
            line: lineNumber,
          })}`,
    );
    appendSection(
      markdown,
      "Token",
      lineUnit?.tokenUnits && lineUnit.tokenUnits.length > 0
        ? lineUnit.tokenUnits.map(renderTokenUnit).join("\n")
        : `No token explanation yet. ${commandLink("Analyze nearby lines", "czaza.analyzeLineRange", {
            uri: document.uri.toString(),
            line: lineNumber,
          })}`,
    );

    return new vscode.Hover(markdown);
  }
}

function appendSection(markdown: vscode.MarkdownString, title: string, body: string) {
  markdown.appendMarkdown(`### ${title}\n${body}\n\n`);
}

function renderStructureUnit(unit: StructureUnit): string {
  return `**${escapeMarkdown(unit.name)}** \`${unit.kind}\` ${renderRange(unit.range.startLine, unit.range.endLine)}\n\n${renderExplanation(
    unit.explanation,
  )}`;
}

function renderSemanticUnit(unit: SemanticUnit): string {
  return `**${escapeMarkdown(unit.title)}** ${renderRange(unit.range.startLine, unit.range.endLine)}\n\n${renderExplanation(
    unit.explanation,
  )}`;
}

function renderTokenUnit(lineUnit: NonNullable<LineUnit["tokenUnits"]>[number]): string {
  const summary = lineUnit.explanation.summary || lineUnit.explanation.detail;
  const kind = lineUnit.kind ? ` _${lineUnit.kind}_` : "";

  return `- \`${escapeBackticks(lineUnit.text)}\`${kind}: ${escapeMarkdown(summary)}`;
}

function renderExplanation(explanation: ExplanationBlock): string {
  const parts = [];

  if (explanation.summary.trim()) {
    parts.push(escapeMarkdown(explanation.summary.trim()));
  }

  if (explanation.detail.trim()) {
    parts.push(escapeMarkdown(explanation.detail.trim()));
  }

  if (explanation.aiNotes && explanation.aiNotes.length > 0) {
    parts.push(`_AI notes:_ ${escapeMarkdown(explanation.aiNotes.join(" "))}`);
  }

  return parts.join("\n\n") || "No explanation text.";
}

function renderRange(startLine: number, endLine: number): string {
  return startLine === endLine ? `(line ${startLine})` : `(lines ${startLine}-${endLine})`;
}

function commandLink(label: string, command: string, payload: Record<string, unknown>): string {
  const encodedArgs = encodeURIComponent(JSON.stringify([payload]));
  return `[${label}](command:${command}?${encodedArgs})`;
}

function includesLine(range: { startLine: number; endLine: number }, lineNumber: number): boolean {
  return range.startLine <= lineNumber && range.endLine >= lineNumber;
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+\-.!|>])/g, "\\$1");
}

function escapeBackticks(value: string): string {
  return value.replaceAll("`", "\\`");
}
