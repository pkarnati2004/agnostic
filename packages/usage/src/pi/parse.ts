// The record shapes - a `session` header, a `model_change` per switch and one `message` per turn,
// with Pi writing `modelId` where OMP writes `model` - come from stablyai/orca
// `src/main/ai-vault/session-scanner-graph-parsers.ts` (MIT © Lovecast Inc.).
import { basename, resolve } from "node:path";
import { z } from "zod";
import { jsonlLines } from "../jsonl-lines.js";
import type { ParsedTranscript, TranscriptParser, TranscriptTurn } from "../transcript-parser.js";

const Tokens = z.number().int().nonnegative().catch(0);

const UsageSchema = z.object({
  input: Tokens.optional(),
  output: Tokens.optional(),
  cacheRead: Tokens.optional(),
  cacheWrite: Tokens.optional(),
  totalTokens: Tokens.optional(),
});

const RecordSchema = z.object({
  type: z.string().min(1),
  // The session's id on a `session` record, the message's own id on a `message` record.
  id: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  timestamp: z.string().min(1).optional(),
  // Pi names the field `modelId`, OMP `model`; a session that has switched models has one of each.
  modelId: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  message: z
    .object({
      role: z.string().min(1).optional(),
      model: z.string().min(1).optional(),
      usage: UsageSchema.optional(),
    })
    .optional(),
});

type GraphRecord = z.infer<typeof RecordSchema>;

/** What the header and the model switches before the current line say about it. */
type Session = { id: string; path: string; cwd: string | null; model: string | null };

export function piFamilyParser(harness: "pi" | "omp"): TranscriptParser {
  return {
    harness,
    reportsLimits: false,
    isTranscript: (path) => path.endsWith(".jsonl"),
    parse: (path) => parseMessageGraph(harness, path),
  };
}

/**
 * One append-only file per session: a `session` header, a `model_change` whenever the model
 * changes, and a `message` per turn. Pi resumes by the path of this file and OMP by the id in its
 * header, so each harness's rows carry the same session its own hook reports.
 */
async function parseMessageGraph(harness: "pi" | "omp", path: string): Promise<ParsedTranscript> {
  const file = resolve(path);
  const session: Session = {
    id: basename(file, ".jsonl"),
    path: file,
    cwd: null,
    model: null,
  };
  const turns: TranscriptTurn[] = [];
  let skipped = 0;
  for await (const { n, text } of jsonlLines(file)) {
    const record = graphRecord(text);
    if (record === null) {
      continue;
    }
    if (record.type === "session") {
      session.id = record.id ?? session.id;
      session.cwd = record.cwd ?? session.cwd;
      continue;
    }
    if (record.type === "model_change") {
      session.model = record.modelId ?? record.model ?? session.model;
      continue;
    }
    // Only an assistant message carries usage, and a row with no time cannot land in a window.
    if (record.type !== "message" || record.message?.role !== "assistant" || !record.timestamp) {
      continue;
    }
    const turn = toTurn(harness, session, record, n);
    if (turn === null) {
      // An assistant message that reported a total and no buckets: nothing to price.
      skipped += record.message.usage === undefined ? 0 : 1;
      continue;
    }
    turns.push(turn);
  }
  return { turns, skipped, limit: null };
}

function graphRecord(line: string): GraphRecord | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    // A half-written last line is what a live session looks like from here.
    return null;
  }
  const parsed = RecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Null when the message reported no bucket at all, which is not the same as zero tokens. */
function toTurn(
  harness: "pi" | "omp",
  session: Session,
  record: GraphRecord,
  line: number,
): TranscriptTurn | null {
  const usage = record.message?.usage;
  const tokensInput = usage?.input ?? 0;
  const tokensOutput = usage?.output ?? 0;
  const tokensCacheRead = usage?.cacheRead ?? null;
  const tokensCacheWrite = usage?.cacheWrite ?? null;
  if (tokensInput + tokensOutput + (tokensCacheRead ?? 0) + (tokensCacheWrite ?? 0) === 0) {
    return null;
  }
  return {
    harness,
    // Pi resumes by transcript path, so the path is the session id its hook reports too.
    sessionId: harness === "pi" ? session.path : session.id,
    cwd: session.cwd,
    ts: record.timestamp ?? "",
    model: record.message?.model ?? session.model,
    tokensInput,
    tokensOutput,
    tokensCacheRead,
    tokensCacheWrite,
    // The line number keeps the ref stable across rescans of a file that is only appended to.
    ref: `${harness}:${session.id}:${record.id ?? line}`,
  };
}
