// export function activate(context: ExtensionContext) {
//   registerCommands(context);
//   registerViews(context);
//   registerProviders(context);
// }

import * as vscode from "vscode";
import { CzazaViewProvider } from "./webview/CzazaViewProvider";

export function activate(context: vscode.ExtensionContext) {
  const provider = new CzazaViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("czaza.descriptionView", provider),
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
