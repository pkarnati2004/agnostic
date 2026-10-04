import type { HarnessId } from "@agnostic/core";
import { parseStatusLinePayload } from "./claude-code/statusline.js";
import type { ObservedLimit } from "./transcript-parser.js";

/** What a harness's status line left for agn, read from the payload as that harness writes it. */
export type StatusLineParser = (text: string, observedAt: string) => ObservedLimit | null;

/** A harness whose status line reports its plan's own meter has a row here and nothing else. */
const PARSERS: Partial<Record<HarnessId, StatusLineParser>> = {
  "claude-code": parseStatusLinePayload,
};

export function statusLineParser(harness: HarnessId): StatusLineParser | null {
  return PARSERS[harness] ?? null;
}
