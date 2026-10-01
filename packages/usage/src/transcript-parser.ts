import type { HarnessId, LimitWindow, PlanLimit } from "@agnostic/core";

/** One priced unit of work as the harness recorded it: an assistant turn, or one API response. */
export type TranscriptTurn = {
  harness: HarnessId;
  /** The harness's own session id, which is also what its hooks report to the daemon. */
  sessionId: string;
  cwd: string | null;
  ts: string;
  model: string | null;
  tokensInput: number;
  tokensOutput: number;
  /** Null where the harness does not report the bucket at all, which is not zero tokens. */
  tokensCacheRead: number | null;
  tokensCacheWrite: number | null;
  /**
   * The ledger's dedupe key. A rescan, and a resume or fork that copies earlier turns into a new
   * transcript file, produce the same ref, so the row is inserted once.
   */
  ref: string;
};

/**
 * A rate limit as a parser read it: the windows the harness reported and nothing else. The vendor
 * is not the parser's to know, and the freshness is not the parser's to judge - `GET /usage`
 * stamps that against its own scan time.
 */
export type ObservedLimit = {
  harness: HarnessId;
  fiveHour: LimitWindow | null;
  week: LimitWindow | null;
  observedAt: string;
  source: PlanLimit["source"];
};

export type ParsedTranscript = {
  turns: TranscriptTurn[];
  /**
   * Usage events the harness reported a total for and no per-bucket split, so there is nothing to
   * price or attribute. Zero for a harness that always reports its buckets.
   */
  skipped: number;
  /** The newest rate limit the file carried, or null for a harness that writes none. */
  limit: ObservedLimit | null;
};

export interface TranscriptParser {
  harness: HarnessId;
  isTranscript(path: string): boolean;
  parse(path: string): Promise<ParsedTranscript>;
}
