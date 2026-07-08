// export function activate(context: ExtensionContext) {
//   registerCommands(context);
//   registerViews(context);
//   registerProviders(context);
// }

import * as vscode from "vscode";
import { ExplanationHoverProvider } from "./explanations/ExplanationHoverProvider";
import { ExplanationStore } from "./explanations/ExplanationStore";
import { registerExplanationCommands } from "./explanations/registerExplanationCommands";
import { CzazaViewProvider } from "./webview/CzazaViewProvider";

export function activate(context: vscode.ExtensionContext) {
  const explanations = new ExplanationStore();
  const provider = new CzazaViewProvider(context.extensionUri, explanations);

  registerExplanationCommands(context, explanations, async (uri) => {
    await provider.showResourceDescription(uri);
  });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("czaza.descriptionView", provider),
    vscode.languages.registerHoverProvider(
      [
        { scheme: "file", language: "typescript" },
        { scheme: "file", language: "typescriptreact" },
        { scheme: "file", language: "javascript" },
        { scheme: "file", language: "javascriptreact" },
        { scheme: "file", language: "csharp" },
      ],
      new ExplanationHoverProvider(explanations),
    ),
    vscode.commands.registerCommand("czaza.showDescription", async (uri?: vscode.Uri) => {
      try {
        await vscode.commands.executeCommand("czaza.descriptionView.focus");
      } catch {
        // The view focus command is best-effort; the description can still update if the view exists.
      }

      await provider.showResourceDescription(uri);
    }),
  );
}

export function deactivate() {}
