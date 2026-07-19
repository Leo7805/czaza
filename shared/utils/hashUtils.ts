/**
 * Runtime-neutral hash helpers for source-code anchoring and synchronization.
 */

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * Creates a stable SHA-256 hash for source text.
 *
 * The returned value includes the algorithm prefix so stored hashes can be
 * migrated safely if CZaza ever changes the hashing algorithm.
 *
 * @param source - Source text to hash.
 * @returns SHA-256 hash with an algorithm prefix.
 *
 * @example
 * const hash = createSourceHash("const value = 1;");
 */
export function createSourceHash(source: string): string {
  return `sha256:${bytesToHex(sha256(utf8ToBytes(source)))}`;
}

/**
 * Creates a lightweight fingerprint for a resource whose content is not read.
 *
 * The distinct prefix makes it clear that this is based on filesystem metadata
 * rather than the complete file content.
 */
export function createFileMetadataHash(input: {
  size: number;
  mtime: number;
  ctime: number;
}): string {
  const metadata = `${input.size}:${input.mtime}:${input.ctime}`;
  return `metadata-sha256:${bytesToHex(sha256(utf8ToBytes(metadata)))}`;
}
