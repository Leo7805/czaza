/**
 * Reads Git identity details and derives stable Personal Notes identifiers.
 */

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** User identity obtained from Git or manual input. */
export type PersonalIdentityDetails = {
  displayName: string;
  email: string;
};

/**
 * Reads the effective Git identity for a project root.
 *
 * @param rootDirectory - Absolute CZaza project root.
 * @returns Complete Git identity, or undefined when either field is unavailable.
 */
export async function readGitIdentity(
  rootDirectory: string,
): Promise<PersonalIdentityDetails | undefined> {
  try {
    const [name, email] = await Promise.all([
      readGitConfigValue(rootDirectory, "user.name"),
      readGitConfigValue(rootDirectory, "user.email"),
    ]);

    return name && email ? { displayName: name, email } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Creates a SHA-256 identity hash from an email address.
 *
 * @param email - User-provided email address.
 * @returns Lowercase hexadecimal SHA-256 hash.
 */
export function createEmailIdentityHash(email: string): string {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

/**
 * Creates a readable member ID from a display name and email hash.
 *
 * @param displayName - Human-readable member name.
 * @param identityHash - Full email identity hash.
 * @param hashLength - Number of leading hash characters to include.
 * @returns Filesystem-safe member ID.
 */
export function createPersonalMemberId(
  displayName: string,
  identityHash: string,
  hashLength = 8,
): string {
  const slug = createDisplayNameSlug(displayName);
  return `${slug}-${identityHash.slice(0, hashLength)}`;
}

/**
 * Normalizes an email before hashing.
 *
 * @param email - Raw email input.
 * @returns Trimmed lowercase email.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Converts a display name to a readable member-ID segment.
 *
 * @param displayName - Raw display name.
 * @returns Lowercase ASCII slug, or `member` when no ASCII characters remain.
 */
export function createDisplayNameSlug(displayName: string): string {
  const slug = displayName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "member";
}

/**
 * Reads one effective Git configuration value without invoking a shell.
 *
 * @param rootDirectory - Git command working directory.
 * @param key - Git configuration key.
 * @returns Trimmed configuration value.
 */
async function readGitConfigValue(rootDirectory: string, key: string): Promise<string> {
  const result = await execFileAsync("git", ["config", "--get", key], { cwd: rootDirectory });
  return result.stdout.trim();
}
