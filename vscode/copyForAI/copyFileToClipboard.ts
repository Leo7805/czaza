/**
 * Provides macOS-specific utilities for copying local files
 * to the system clipboard as file objects.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Copies a local file to the macOS clipboard as a file object.
 *
 * The copied file can be pasted into applications that accept file
 * attachments, such as Finder, ChatGPT, email clients, and messaging apps.
 *
 * @param filePath - The absolute path of the local file to copy.
 */
export async function copyFileToClipboard(filePath: string): Promise<void> {
  const script = `
        on run argv
            set the clipboard to POSIX file (item 1 of argv)
        end run
    `;

  await execFileAsync("osascript", ["-e", script, filePath]);
}
