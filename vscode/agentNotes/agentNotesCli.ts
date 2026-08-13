/**
 * Provides stdin-driven CLI commands for inspecting, confirming, and applying Agent Note changes.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";

import { PersonalIdentityRepository } from "@vscode/personalNotes";
import { applyAgentNoteUpdates } from "./applyAgentNoteUpdates";
import type { AgentNoteIdentityLookup } from "./agentNoteOwner";
import type {
  AgentNoteUpdatePlan,
  ApplyAgentNoteUpdatesInput,
  InspectAgentNotesInput,
} from "./agentNoteTypes";
import { createAgentNoteUpdateConfirmation } from "./createAgentNoteUpdateConfirmation";
import { formatAgentNoteUpdateReport } from "./formatAgentNoteUpdateReport";
import { inspectAgentNotes } from "./inspectAgentNotes";
import { ActiveNotesSelectionRepository } from "./ActiveNotesSelectionRepository";
import type { CurrentAgentNotesInput } from "./agentNoteTypes";
import { resolveAgentNoteOwner } from "./agentNoteOwner";

/** Supported Agent Notes CLI command. */
export type AgentNotesCliCommand = "current" | "inspect" | "confirm" | "apply";

/** Replaceable command dependencies used by focused CLI tests. */
export type AgentNotesCliDependencies = {
  inspect: typeof inspectAgentNotes;
  confirm: typeof createAgentNoteUpdateConfirmation;
  apply: typeof applyAgentNoteUpdates;
  format: typeof formatAgentNoteUpdateReport;
  identities: AgentNoteIdentityLookup;
  activeNotes: ActiveNotesSelectionRepository;
};

/**
 * Runs one Agent Notes command against a complete JSON input string.
 *
 * @param command - Inspect, confirmation, or apply operation.
 * @param inputText - Complete JSON object read from standard input.
 * @param dependencies - Replaceable runtime dependencies.
 * @returns JSON for current/inspect/confirm or readable text for apply.
 */
export async function runAgentNotesCli(
  command: string | undefined,
  inputText: string,
  dependencies: AgentNotesCliDependencies = createDefaultDependencies(),
): Promise<string> {
  assertCommand(command);
  const input = parseJsonInput(inputText);

  if (command === "current") {
    const request = input as CurrentAgentNotesInput;
    const workspaceRoot = path.resolve(request.workspaceRoot);
    const current = await dependencies.activeNotes.load(workspaceRoot);
    if (!current || current.outputDirectory !== request.outputDirectory) {
      throw new Error("No current CZaza Notes were found. Open the Notes view for this project first.");
    }
    const owner = await resolveAgentNoteOwner(
      workspaceRoot,
      request.outputDirectory,
      current.location,
      dependencies.identities,
    );
    return `${JSON.stringify({ ...current, owner }, null, 2)}\n`;
  }

  if (command === "inspect") {
    const result = await dependencies.inspect(
      input as InspectAgentNotesInput,
      undefined,
      dependencies.identities,
    );
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  if (command === "confirm") {
    const result = await dependencies.confirm(
      input as AgentNoteUpdatePlan,
      dependencies.identities,
    );
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const report = await dependencies.apply(
    input as ApplyAgentNoteUpdatesInput,
    undefined,
    undefined,
    dependencies.identities,
    dependencies.activeNotes,
  );
  return `${dependencies.format(report)}\n`;
}

/**
 * Reads all UTF-8 content from standard input.
 *
 * @returns Complete stdin text after the stream ends.
 */
export async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Parses one required JSON object from CLI input. */
function parseJsonInput(inputText: string): Record<string, unknown> {
  if (!inputText.trim()) throw new Error("Agent Notes CLI requires a JSON object on stdin.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(inputText) as unknown;
  } catch {
    throw new Error("Agent Notes CLI received invalid JSON on stdin.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Agent Notes CLI input must be one JSON object.");
  }
  return parsed as Record<string, unknown>;
}

/** Narrows one command string to the supported command set. */
function assertCommand(command: string | undefined): asserts command is AgentNotesCliCommand {
  if (command !== "current" && command !== "inspect" && command !== "confirm" && command !== "apply") {
    throw new Error("Usage: npm run notes:agent -- <current|inspect|confirm|apply>");
  }
}

/** Creates filesystem-backed dependencies for normal CLI execution. */
function createDefaultDependencies(): AgentNotesCliDependencies {
  const repository = new PersonalIdentityRepository();
  const activeNotes = new ActiveNotesSelectionRepository();
  const identities: AgentNoteIdentityLookup = {
    async listMembers(workspaceRoot, outputDirectory) {
      const index = await repository.loadIndex(workspaceRoot, outputDirectory);
      return Object.values(index?.members ?? {}).sort((left, right) =>
        left.displayName.localeCompare(right.displayName),
      );
    },
  };
  return {
    inspect: inspectAgentNotes,
    confirm: createAgentNoteUpdateConfirmation,
    apply: applyAgentNoteUpdates,
    format: formatAgentNoteUpdateReport,
    identities,
    activeNotes,
  };
}

/** Runs the process entry point and reports command errors through stderr. */
async function main(): Promise<void> {
  try {
    process.stdout.write(await runAgentNotesCli(process.argv[2], await readStandardInput()));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (isDirectCliExecution(process.argv[1])) {
  await main();
}

/** Reports whether this module is the process entry point in source or bundled form. */
function isDirectCliExecution(entryPath: string | undefined): boolean {
  return entryPath !== undefined && fileURLToPath(import.meta.url) === entryPath;
}
