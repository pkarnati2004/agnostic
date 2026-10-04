import { readFile, stat } from "node:fs/promises";
import type { AgnosticPaths, HarnessId } from "@agnostic/core";
import { rateLimitsFile } from "@agnostic/hooks";
import { type ObservedLimit, statusLineParser } from "@agnostic/usage";
import type { Logger } from "./log.js";

/** `GET /usage` reads this file per request; a payload agn cannot read is worth saying once. */
const reported = new Set<string>();

/**
 * What a harness's status line left for agn: the payload as the harness wrote it, and the file's
 * mtime as the time it said it. Read per request, never on a timer - one stat and one small read.
 * A harness agn has no parser for has no file worth opening.
 */
export async function readRateLimitsFile(
  paths: AgnosticPaths,
  harness: HarnessId,
  log?: Logger,
): Promise<ObservedLimit | null> {
  const parse = statusLineParser(harness);
  if (parse === null) {
    return null;
  }
  const file = rateLimitsFile(paths, harness);
  const info = await stat(file).catch(() => null);
  if (info === null) {
    return null;
  }
  const text = await readFile(file, "utf8").catch(() => null);
  if (text === null) {
    return null;
  }
  const limit = parse(text, new Date(info.mtimeMs).toISOString());
  if (limit === null && !reported.has(file)) {
    reported.add(file);
    // A payload agn cannot read is a schema that drifted: the bar falls back to tokens and cost.
    log?.debug("rate limits file carried no window agn could read", { harness, file });
  }
  return limit;
}
