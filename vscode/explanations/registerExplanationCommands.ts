import * as vscode from "vscode";
import { loadConfig } from "@node/config/loadConfig";
import type { AiClient } from "@shared/ai/aiClient";
import { getLanguageFromId } from "@shared/parser/language";
import { callDeepSeek } from "@shared/providers/deepseek";
import { explainFileStructureService } from "@shared/services/explainFileStructureService";
import { explainLineRangeService } from "@shared/services/explainLineRangeService";
import { explainSemanticService } from "@shared/services/explainSemanticService";
import type { CodeExplanation } from "@shared/types/codeExplanation";
import { ExplanationCache } from "./ExplanationCache";
import { ExplanationStore } from "./ExplanationStore";

type CommandPayload = {
  uri?: string;
  line?: number;
};

export function registerExplanationCommands(
  context: vscode.ExtensionContext,
  store: ExplanationStore,
  cache: ExplanationCache,
  refreshDescription: (uri: vscode.Uri) => Promise<void>,
) {
  context.subscriptions.push(
    vscode.commands.registerCommand("czaza.analyzeFileStructure", async (payload?: CommandPayload) => {
      const document = await resolveDocument(payload);

      if (!document) {
        vscode.window.showWarningMessage("Open a local source file before analyzing CZaza explanations.");
        return;
      }

      await cache.loadForUri(document.uri, store);
      const explanation = await analyzeFileStructure(document, store);
      await cache.saveForUri(document.uri, store);
      await refreshDescription(document.uri);
      vscode.window.showInformationMessage(
        `CZaza analyzed file and ${explanation.structureUnits.length} structure unit(s).`,
      );
    }),
    vscode.commands.registerCommand("czaza.analyzeSemantic", async (payload?: CommandPayload) => {
      const document = await resolveDocument(payload);

      if (!document) {
        vscode.window.showWarningMessage("Open a local source file before analyzing semantic units.");
        return;
      }

      const contextExplanation = await ensureFileStructure(document, store, cache);

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "CZaza: analyzing semantic units",
          cancellable: false,
        },
        async () => {
          const semanticUnits = await explainSemanticService(
            {
              sourceCode: document.getText(),
              filePath: document.uri.fsPath,
              language: getLanguageFromId(document.languageId),
              context: contextExplanation,
            },
            getConfiguredDeepSeekClient(document.uri),
          );

          store.setSemanticUnits(document.uri, semanticUnits);
          await cache.saveForUri(document.uri, store);
          vscode.window.showInformationMessage(
            `CZaza analyzed ${semanticUnits.length} semantic unit(s).`,
          );
        },
      );
    }),
    vscode.commands.registerCommand("czaza.analyzeLineRange", async (payload?: CommandPayload) => {
      const document = await resolveDocument(payload);

      if (!document) {
        vscode.window.showWarningMessage("Open a local source file before analyzing line ranges.");
        return;
      }

      const contextExplanation = await ensureFileStructure(document, store, cache);
      const state = store.get(document.uri);
      const contextWithSemantic: CodeExplanation = {
        ...contextExplanation,
        semanticUnits: state?.semanticUnits ?? [],
      };
      const range = getLineRange(payload?.line ?? getActiveLineNumber(), document.lineCount);

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `CZaza: analyzing lines ${range.startLine}-${range.endLine}`,
          cancellable: false,
        },
        async () => {
          const lineUnits = await explainLineRangeService(
            {
              sourceCode: document.getText(),
              filePath: document.uri.fsPath,
              language: getLanguageFromId(document.languageId),
              range,
              context: contextWithSemantic,
            },
            getConfiguredDeepSeekClient(document.uri),
          );

          store.addLineUnits(document.uri, lineUnits);
          await cache.saveForUri(document.uri, store);
          vscode.window.showInformationMessage(`CZaza analyzed ${lineUnits.length} line(s).`);
        },
      );
    }),
  );
}

async function ensureFileStructure(
  document: vscode.TextDocument,
  store: ExplanationStore,
  cache: ExplanationCache,
): Promise<CodeExplanation> {
  await cache.loadForUri(document.uri, store);
  const existing = store.get(document.uri)?.fileStructure;

  if (existing) {
    return existing;
  }

  return analyzeFileStructure(document, store);
}

async function analyzeFileStructure(
  document: vscode.TextDocument,
  store: ExplanationStore,
): Promise<CodeExplanation> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "CZaza: analyzing file structure",
      cancellable: false,
    },
    async () => {
      const explanation = await explainFileStructureService(
        {
          sourceCode: document.getText(),
          filePath: document.uri.fsPath,
          language: getLanguageFromId(document.languageId),
        },
        getConfiguredDeepSeekClient(document.uri),
      );

      store.setFileStructure(document.uri, explanation);
      return explanation;
    },
  );
}

function getConfiguredDeepSeekClient(resourceUri: vscode.Uri): AiClient {
  return {
    complete: async (prompt) => callDeepSeek(prompt, { apiKey: await getDeepSeekApiKey(resourceUri) }),
  };
}

async function getDeepSeekApiKey(resourceUri: vscode.Uri): Promise<string | undefined> {
  const configuredKey = vscode.workspace
    .getConfiguration("czaza")
    .get("deepSeekApiKey", "")
    .trim();

  if (configuredKey) {
    return configuredKey;
  }

  const workspace = vscode.workspace.getWorkspaceFolder(resourceUri);

  if (!workspace) {
    return undefined;
  }

  const config = await loadConfig(workspace.uri.fsPath);
  return config.ai.deepSeekApiKey.trim() || undefined;
}

async function resolveDocument(payload: CommandPayload | undefined): Promise<vscode.TextDocument | undefined> {
  if (payload?.uri) {
    const uri = vscode.Uri.parse(payload.uri);

    if (uri.scheme !== "file") {
      return undefined;
    }

    return vscode.workspace.openTextDocument(uri);
  }

  return vscode.window.activeTextEditor?.document;
}

function getActiveLineNumber(): number {
  return (vscode.window.activeTextEditor?.selection.active.line ?? 0) + 1;
}

function getLineRange(lineNumber: number, lineCount: number) {
  return {
    startLine: Math.max(1, lineNumber - 3),
    endLine: Math.min(lineCount, lineNumber + 3),
  };
}
