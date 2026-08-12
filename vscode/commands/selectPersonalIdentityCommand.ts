/**
 * Registers the interactive Personal Notes identity confirmation command.
 */

import * as vscode from "vscode";

import { getCzazaSettings } from "@vscode/config/czazaSettings";
import { resolveCzazaRootDirectory } from "@vscode/config/resolveCzazaRootDirectory";
import {
  type PersonalIdentityDetails,
  type PersonalIdentityMember,
  type PersonalIdentityService,
  readGitIdentity,
} from "@vscode/personalNotes";

/** Registers `CZaza: Select Personal Identity`. */
export function registerSelectPersonalIdentityCommand(
  context: vscode.ExtensionContext,
  identities: PersonalIdentityService,
): void {
  const command = vscode.commands.registerCommand("czaza.selectPersonalIdentity", async () => {
    try {
      const resource = vscode.window.activeTextEditor?.document.uri;
      const { rootDirectory } = resolveCzazaRootDirectory(resource);
      const { outputDirectory } = getCzazaSettings(resource);
      const current = await identities.getCurrentIdentity(rootDirectory, outputDirectory);

      if (current) {
        const action = await vscode.window.showQuickPick(
          [
            { label: `Keep ${current.displayName}`, action: "keep" as const },
            { label: "Choose Another Identity", action: "choose" as const },
          ],
          { title: `Current Personal Notes identity: ${current.displayName}`, ignoreFocusOut: true },
        );
        if (!action || action.action === "keep") return;
      }

      const gitIdentity = await readGitIdentity(rootDirectory);
      if (gitIdentity) {
        const matched = await identities.findByEmail(rootDirectory, outputDirectory, gitIdentity.email);
        if (matched && await confirmUseIdentity(matched)) {
          await identities.bindCurrentIdentity(rootDirectory, matched.memberId);
          showIdentitySelected(matched);
          return;
        }

        if (!matched) {
          const action = await vscode.window.showInformationMessage(
            `Create Personal Notes identity "${gitIdentity.displayName}" from the current Git identity?`,
            { modal: true, detail: "The email is used only to calculate an identity hash and is not stored." },
            "Create",
            "Choose Existing",
            "Edit Details",
          );
          if (action === "Create") {
            await createAndBind(identities, rootDirectory, outputDirectory, gitIdentity);
            return;
          }
          if (action === "Edit Details") {
            const details = await requestIdentityDetails(gitIdentity);
            if (details) await createOrMatchAndBind(identities, rootDirectory, outputDirectory, details);
            return;
          }
          if (action !== "Choose Existing") return;
        }
      }

      const selected = await chooseExistingIdentity(identities, rootDirectory, outputDirectory);
      if (selected === "create") {
        const details = await requestIdentityDetails(gitIdentity);
        if (details) await createOrMatchAndBind(identities, rootDirectory, outputDirectory, details);
        return;
      }
      if (selected && await confirmUseIdentity(selected)) {
        await identities.bindCurrentIdentity(rootDirectory, selected.memberId);
        showIdentitySelected(selected);
      }
    } catch (error) {
      void vscode.window.showErrorMessage(`Failed to select Personal Notes identity: ${getErrorMessage(error)}`);
    }
  });

  context.subscriptions.push(command);
}

/** Creates or matches an identity from manually confirmed details and binds it. */
async function createOrMatchAndBind(
  identities: PersonalIdentityService,
  rootDirectory: string,
  outputDirectory: string,
  details: PersonalIdentityDetails,
): Promise<void> {
  const existing = await identities.findByEmail(rootDirectory, outputDirectory, details.email);
  if (existing) {
    if (await confirmUseIdentity(existing)) {
      await identities.bindCurrentIdentity(rootDirectory, existing.memberId);
      showIdentitySelected(existing);
    }
    return;
  }
  await createAndBind(identities, rootDirectory, outputDirectory, details);
}

/** Creates a new identity, binds it locally, and reports success. */
async function createAndBind(
  identities: PersonalIdentityService,
  rootDirectory: string,
  outputDirectory: string,
  details: PersonalIdentityDetails,
): Promise<void> {
  const member = await identities.createIdentity(rootDirectory, outputDirectory, details);
  await identities.bindCurrentIdentity(rootDirectory, member.memberId);
  showIdentitySelected(member);
}

/** Lets the user choose a repository identity or request creation. */
async function chooseExistingIdentity(
  identities: PersonalIdentityService,
  rootDirectory: string,
  outputDirectory: string,
): Promise<PersonalIdentityMember | "create" | undefined> {
  const members = await identities.listMembers(rootDirectory, outputDirectory);
  const selected = await vscode.window.showQuickPick(
    [
      ...members.map((member) => ({ label: member.displayName, description: member.memberId, member })),
      { label: "$(add) Create New Identity", description: "Create a Personal Notes identity" },
    ],
    { title: "Select Personal Notes Identity", ignoreFocusOut: true },
  );
  if (!selected) return undefined;
  return "member" in selected ? selected.member : "create";
}

/** Requests display name and email using standard VS Code input boxes. */
async function requestIdentityDetails(
  defaults?: PersonalIdentityDetails,
): Promise<PersonalIdentityDetails | undefined> {
  const displayName = await vscode.window.showInputBox({
    title: "Personal Notes Display Name",
    value: defaults?.displayName,
    ignoreFocusOut: true,
    validateInput: (value) => value.trim() ? undefined : "Display name cannot be empty.",
  });
  if (displayName === undefined) return undefined;
  const email = await vscode.window.showInputBox({
    title: "Personal Notes Identity Email",
    prompt: "Used only to calculate an identity hash; the email is not stored.",
    value: defaults?.email,
    ignoreFocusOut: true,
    validateInput: (value) => /^\S+@\S+\.\S+$/.test(value.trim()) ? undefined : "Enter a valid email address.",
  });
  return email === undefined ? undefined : { displayName: displayName.trim(), email: email.trim() };
}

/** Confirms switching normal Personal Notes writes to one identity. */
async function confirmUseIdentity(member: PersonalIdentityMember): Promise<boolean> {
  const choice = await vscode.window.showWarningMessage(
    `Use ${member.displayName} as your Personal Notes identity in this workspace?`,
    { modal: true, detail: "This is a confirmation against accidental selection, not authentication." },
    "Use Identity",
  );
  return choice === "Use Identity";
}

/** Shows the selected identity without exposing its email hash. */
function showIdentitySelected(member: PersonalIdentityMember): void {
  void vscode.window.showInformationMessage(`Personal Notes identity set to ${member.displayName}.`);
}

/** Converts an unknown error to user-facing text. */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}
