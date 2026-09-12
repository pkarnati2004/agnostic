import { realpath } from "node:fs/promises";
import { join } from "node:path";
import type { Catalog } from "@agnostic/catalog";
import { type Billing, parseProfileId, type Task } from "@agnostic/core";
import type { UsageInput } from "@agnostic/ledger";
import { harnesses } from "@agnostic/registry";
import {
  attributeTurns,
  costForTurn,
  type ScanMemo,
  type SessionOwner,
  scanTranscripts,
  type TranscriptRoot,
  type TranscriptTurn,
} from "@agnostic/usage";
import type { DaemonContext } from "./app.js";

export type UsageScanner = {
  /** Reads the transcripts and records what is new; `taskId` only says what asked for the scan. */
  scan(opts?: { taskId?: string }): Promise<{ inserted: number }>;
};

type ScanDeps = Pick<DaemonContext, "ledger" | "detection" | "catalog" | "env" | "log">;

/**
 * Transcripts older than this are never opened. Without a floor the first scan on a machine with
 * years of history would read gigabytes; a file nobody has written to in two weeks has no usage
 * agn has not already recorded.
 */
const FLOOR_DAYS = 14;

const TERMINAL = new Set(["done", "failed", "stopped"]);

/**
 * The one thing that reads the user's transcript directories. It runs when usage is asked for and
 * when a task closes (ADR 021), never on a timer: a scan over an unchanged tree costs one stat per
 * file, and the ledger's unique ref makes a rescan insert nothing.
 */
export function createUsageScanner(deps: ScanDeps): UsageScanner {
  const memo: ScanMemo = new Map();
  let inFlight: Promise<{ inserted: number }> | null = null;

  return {
    scan(opts = {}) {
      // A second request while a scan runs shares it rather than reading every file twice.
      inFlight ??= run(deps, memo, opts.taskId).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}

async function run(
  deps: ScanDeps,
  memo: ScanMemo,
  taskId: string | undefined,
): Promise<{ inserted: number }> {
  const started = Date.now();
  const { turns, parsedFiles, skipped, problems } = await scanTranscripts({
    roots: transcriptRoots(deps.env.HOME),
    memo,
    modifiedSince: started - FLOOR_DAYS * 24 * 60 * 60 * 1_000,
  });
  for (const problem of problems) {
    deps.log.error("usage scan problem", { message: problem.message, code: problem.code });
  }
  const tasks = deps.ledger.tasks.list();
  const owners = await sessionOwners(tasks);
  const billing = await billingByTask(deps, tasks);
  // Read once per scan: a catalog that reloads mid-scan must not price two turns differently.
  const { catalog } = deps.catalog.current();
  let inserted = 0;
  for (const [owner, group] of attributeTurns(turns, owners)) {
    const rows = group.map((turn) =>
      usageRow(turn, owner === null ? null : (billing.get(owner) ?? null), catalog),
    );
    inserted += deps.ledger.usage.record(owner, rows).inserted;
  }
  deps.log.info("usage scanned", {
    files: parsedFiles,
    turns: turns.length,
    inserted,
    ms: Date.now() - started,
    ...(taskId === undefined ? {} : { taskId }),
  });
  if (skipped > 0) {
    // Codex Desktop reports a context total and no buckets, so those turns become no row at all.
    deps.log.debug("usage turns without a token split", { turns: skipped });
  }
  return { inserted };
}

/** Only the harnesses that write a transcript agn can read, under the home the daemon was given. */
function transcriptRoots(home: string | undefined): TranscriptRoot[] {
  if (home === undefined) {
    return [];
  }
  return harnesses
    .filter((definition) => definition.tier === 1)
    .flatMap((definition) =>
      definition.transcriptsDir === null
        ? []
        : [{ harness: definition.id, dir: join(home, definition.transcriptsDir) }],
    );
}

/**
 * Every task that has ever had a session, with the span it held its directory for. The harnesses
 * write resolved paths, so the owners' directories are resolved too or a task under `/tmp` would
 * never match on macOS.
 */
async function sessionOwners(tasks: Task[]): Promise<SessionOwner[]> {
  const owners: SessionOwner[] = [];
  for (const task of tasks) {
    if (task.session === undefined) {
      continue;
    }
    owners.push({
      taskId: task.id,
      harness: task.session.harness,
      sessionId: task.session.sessionId,
      cwd: await realpath(task.session.cwd).catch(() => task.session?.cwd ?? ""),
      startedAt: task.createdAt,
      // A closed task stopped spending when it settled; a live one is still spending now.
      endedAt: TERMINAL.has(task.status) ? task.updatedAt : null,
    });
  }
  return owners;
}

/**
 * How a task's tokens are paid for. The detected profile is the answer where there is one;
 * otherwise the profile id says enough - a native route is the harness's own subscription, and
 * anything else runs on a key the user pays per token for (ADR 016). The task view reads this too,
 * so what it shows is what the rows were priced under.
 */
export async function billingForProfile(
  detection: ScanDeps["detection"],
  profileId: string,
): Promise<Billing | null> {
  const { profiles } = await detection.current();
  const detected = profiles.find((profile) => profile.id === profileId);
  if (detected !== undefined) {
    return detected.billing;
  }
  try {
    return parseProfileId(profileId).route === "native" ? null : "api-key";
  } catch {
    // A profile id agn cannot read says nothing about who pays for it.
    return null;
  }
}

async function billingByTask(deps: ScanDeps, tasks: Task[]): Promise<Map<string, Billing | null>> {
  const billing = new Map<string, Billing | null>();
  for (const task of tasks) {
    billing.set(task.id, await billingForProfile(deps.detection, task.profileId));
  }
  return billing;
}

function cache(turn: TranscriptTurn): number {
  return (turn.tokensCacheRead ?? 0) + (turn.tokensCacheWrite ?? 0);
}

/** Tokens a task does not own are never priced: agn does not know what they were billed under. */
function usageRow(turn: TranscriptTurn, billing: Billing | null, catalog: Catalog): UsageInput {
  return {
    ts: turn.ts,
    harness: turn.harness,
    model: turn.model,
    tokens: turn.tokensInput + turn.tokensOutput + cache(turn),
    tokensInput: turn.tokensInput,
    tokensOutput: turn.tokensOutput,
    tokensCacheRead: turn.tokensCacheRead,
    tokensCacheWrite: turn.tokensCacheWrite,
    costUsd: billing === null ? null : costForTurn(turn, billing, catalog),
    source: "transcript",
    ref: turn.ref,
  };
}
