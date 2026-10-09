// Adapted from stablyai/orca (MIT © Lovecast Inc.).
// Codex gates every hook handler on a `trusted_hash` it stores per handler in `config.toml`, and
// asks the user to approve anything else in `/hooks`.
import { createHash } from "node:crypto";

type TrustEntry = {
  label: string;
  command: string;
  timeoutSec: number;
  matcher?: string;
};

/** `SessionStart` is `session_start` in every key and in the hashed handler definition. */
export function codexEventLabel(event: string): string {
  return event.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/** The handler's identity: the file it came from, its event, its group and its place in the group. */
export function trustKey(file: string, label: string, group: number, handler: number): string {
  return `${file}:${label}:${group}:${handler}`;
}

/**
 * sha256 over the handler as Codex serialises it: keys sorted, the group's matcher included when
 * it has one, and the timeout as written. The literals below are already in sorted order.
 */
export function trustedHash(entry: TrustEntry): string {
  const definition = {
    event_name: entry.label,
    hooks: [{ async: false, command: entry.command, timeout: entry.timeoutSec, type: "command" }],
    ...(entry.matcher === undefined ? {} : { matcher: entry.matcher }),
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(definition)).digest("hex")}`;
}
