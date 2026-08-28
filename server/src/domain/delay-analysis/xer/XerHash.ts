import { createHash } from "node:crypto";

/**
 * SHA-256 hex digest of a byte buffer. Shared by the diff engine and the
 * round-trip service so every independently-verifiable hash in the system
 * is produced by exactly one function, computed the same way every time.
 */
export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
