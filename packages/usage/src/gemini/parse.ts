// The chats document's shape - a whole-file JSON object with `sessionId` and a `messages` array
// whose assistant entries are typed `gemini` and carry `tokens` and `model` - comes from
// stablyai/orca `src/main/ai-vault/session-scanner-gemini-parsers.ts` (MIT © Lovecast Inc.).
// Unverified live: no Gemini CLI was installed on the machine this was written on.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";
import type { ParsedTranscript, TranscriptParser, TranscriptTurn } from "../transcript-parser.js";

const Tokens = z.number().int().nonnegative().catch(0);

/**
 * Gemini reports the cached part inside `input` and reasoning in `thoughts`, beside `output`.
 * `total` is the sum it computed; a message that carries only that has no split to price.
 */
const TokensSchema = z.object({
  input: Tokens.optional(),
  output: Tokens.optional(),
  cached: Tokens.optional(),
  thoughts: Tokens.optional(),
  tool: Tokens.optional(),
  total: Tokens.optional(),
});

const MessageSchema = z.object({
  id: z.string().min(1).optional(),
  type: z.string().min(1),
  timestamp: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  tokens: TokensSchema.nullish(),
});

const DocumentSchema = z.object({
  sessionId: z.string().min(1).optional(),
  messages: z.array(z.unknown()).optional(),
});

/** `~/.gemini/tmp/<project hash>/chats/session-<id>.json`; the checkpoints beside it are not usage. */
const CHATS_FILE = /\/chats\/session-[^/]+\.json$/;

export const geminiParser: TranscriptParser = {
  harness: "gemini",
  isTranscript: (path) => CHATS_FILE.test(path),
  parse: parseGeminiChat,
};

/**
 * One file per session, rewritten whole on every turn, so it is parsed whole: one turn per
 * assistant message that carries a token split. Gemini keys the directory by a hash of the project
 * path and writes no working directory inside the file, so the rows are attributed by session id.
 */
async function parseGeminiChat(path: string): Promise<ParsedTranscript> {
  // A file that is not JSON is reported as unreadable by the scan rather than counted as empty.
  const document = DocumentSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const sessionId = document.sessionId ?? basename(path, ".json");
  const turns: TranscriptTurn[] = [];
  let skipped = 0;
  for (const [index, raw] of (document.messages ?? []).entries()) {
    const parsed = MessageSchema.safeParse(raw);
    if (!parsed.success || parsed.data.type !== "gemini" || !parsed.data.timestamp) {
      continue;
    }
    const turn = toTurn(sessionId, parsed.data, index);
    if (turn === null) {
      // A message that reported `total` alone: nothing to split between the buckets.
      skipped += parsed.data.tokens == null ? 0 : 1;
      continue;
    }
    turns.push(turn);
  }
  return { turns, skipped, limit: null };
}

/** Null when the message reported no bucket of its own, whatever total it also carried. */
function toTurn(
  sessionId: string,
  message: z.infer<typeof MessageSchema>,
  index: number,
): TranscriptTurn | null {
  const tokens = message.tokens;
  const cached = tokens?.cached ?? 0;
  // Gemini counts the cached part inside its input figure, so the two are split, not added.
  const tokensInput = Math.max(0, (tokens?.input ?? 0) - cached);
  // A thought is billed as output, and Gemini reports it beside output rather than inside it.
  const tokensOutput = (tokens?.output ?? 0) + (tokens?.thoughts ?? 0);
  if (tokensInput + tokensOutput + cached === 0) {
    return null;
  }
  return {
    harness: "gemini",
    sessionId,
    cwd: null,
    ts: message.timestamp ?? "",
    model: message.model ?? null,
    tokensInput,
    tokensOutput,
    tokensCacheRead: cached,
    // Gemini reports no cache-write bucket, and zero would claim it reported one.
    tokensCacheWrite: null,
    costUsd: null,
    ref: `gemini:${sessionId}:${message.id ?? index}`,
  };
}
