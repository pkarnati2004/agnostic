import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** The auth token rides in the workspace URL, so every line the app writes passes through here. */
export function redact(text: string, secret: string): string {
  return secret === "" ? text : text.replaceAll(secret, "…");
}

/** Appends one timestamped line per call; the packaged app has no stdout anyone reads. */
export function shellLog(file: string, secret: string | null): (line: string) => void {
  return (line) => {
    const safe = secret === null ? line : redact(line, secret);
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${new Date().toISOString()} ${safe}\n`);
  };
}
