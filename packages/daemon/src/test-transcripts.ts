import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// Not part of the package's exports: this is how a usage test gives a daemon something to read.
type FakeTurn = {
  session: string;
  cwd: string;
  model?: string;
  ts?: string;
  message?: string;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  /** What the harness itself says the turn cost, for the harnesses that write one. */
  cost?: number;
};

/** A Claude Code transcript under `<home>/.claude/projects`, in the shape the real one has. */
export async function writeClaudeTranscript(home: string, turns: FakeTurn[]): Promise<void> {
  for (const turn of turns) {
    const record = {
      type: "assistant",
      sessionId: turn.session,
      timestamp: turn.ts ?? new Date().toISOString(),
      cwd: turn.cwd,
      requestId: `req_${turn.message ?? "a"}`,
      uuid: `u-${turn.message ?? "a"}`,
      message: {
        id: `msg_${turn.message ?? "a"}`,
        role: "assistant",
        model: turn.model ?? "claude-fable-5-1",
        usage: {
          input_tokens: turn.input ?? 1_000,
          output_tokens: turn.output ?? 500,
          cache_read_input_tokens: turn.cacheRead ?? 0,
          cache_creation_input_tokens: turn.cacheWrite ?? 0,
        },
      },
    };
    await append(
      join(home, ".claude", "projects", encode(turn.cwd), `${turn.session}.jsonl`),
      record,
    );
  }
}

/** A Codex rollout under `<home>/.codex/sessions`, header first and one token count per turn. */
export async function writeCodexRollout(home: string, turns: FakeTurn[]): Promise<void> {
  for (const [index, turn] of turns.entries()) {
    const ts = turn.ts ?? new Date().toISOString();
    const path = join(
      home,
      ".codex",
      "sessions",
      "2026",
      "09",
      "11",
      `rollout-${turn.session}.jsonl`,
    );
    if (index === 0) {
      await append(path, {
        timestamp: ts,
        type: "session_meta",
        payload: { id: turn.session, cwd: turn.cwd, originator: "codex-tui" },
      });
      await append(path, {
        timestamp: ts,
        type: "turn_context",
        payload: { cwd: turn.cwd, model: turn.model ?? "gpt-6-astra" },
      });
    }
    await append(path, {
      timestamp: ts,
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: {
            input_tokens: (turn.input ?? 1_000) + (turn.cacheRead ?? 0),
            cached_input_tokens: turn.cacheRead ?? 0,
            output_tokens: turn.output ?? 500,
          },
        },
      },
    });
  }
}

/** A Gemini chats document under `<home>/.gemini/tmp/<hash>/chats`, rewritten whole each turn. */
export async function writeGeminiChat(home: string, turn: FakeTurn): Promise<void> {
  const path = join(home, ".gemini", "tmp", "8c1f", "chats", `session-${turn.session}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify({
      sessionId: turn.session,
      messages: [
        {
          id: `m_${turn.message ?? "a"}`,
          type: "gemini",
          timestamp: turn.ts ?? new Date().toISOString(),
          model: turn.model ?? "gemini-3-pro",
          tokens: {
            input: (turn.input ?? 1_000) + (turn.cacheRead ?? 0),
            output: turn.output ?? 500,
            cached: turn.cacheRead ?? 0,
          },
        },
      ],
    }),
  );
}

/** Grok's one log under `<home>/.grok/logs`, with an inference event per turn. */
export async function writeGrokLog(home: string, turns: FakeTurn[]): Promise<void> {
  for (const turn of turns) {
    await append(join(home, ".grok", "logs", "unified.jsonl"), {
      ts: turn.ts ?? new Date().toISOString(),
      event: "shell.turn.inference_done",
      sessionId: turn.session,
      cwd: turn.cwd,
      model: turn.model ?? "grok-5",
      usage: {
        input_tokens: (turn.input ?? 1_000) + (turn.cacheRead ?? 0),
        output_tokens: turn.output ?? 500,
        cached_tokens: turn.cacheRead ?? 0,
      },
    });
  }
}

/** fx's session log under `<home>/.fx/sessions/<id>`, whose checkpoints are cumulative. */
export async function writeFxEvents(home: string, turn: FakeTurn): Promise<void> {
  await append(join(home, ".fx", "sessions", turn.session, "events.jsonl"), {
    ts: turn.ts ?? new Date().toISOString(),
    type: "usage_checkpointed",
    model: turn.model ?? "fx-sonnet",
    usage: { input: turn.input ?? 1_000, output: turn.output ?? 500 },
    cost: 0.21,
  });
}

/** A Pi session log under `<home>/.pi/agent/sessions`, whose usage carries the cost Pi wrote. */
export async function writePiSession(home: string, turn: FakeTurn): Promise<void> {
  const ts = turn.ts ?? new Date().toISOString();
  const path = join(home, ".pi", "agent", "sessions", `${turn.session}.jsonl`);
  await append(path, { type: "session", id: turn.session, cwd: turn.cwd, timestamp: ts });
  await append(path, {
    type: "message",
    id: `msg_${turn.message ?? "a"}`,
    timestamp: ts,
    message: {
      role: "assistant",
      model: turn.model ?? "anthropic/claude-fable-5-1",
      usage: {
        input: turn.input ?? 1_000,
        output: turn.output ?? 500,
        ...(turn.cost === undefined ? {} : { cost: turn.cost }),
      },
    },
  });
}

/** Claude Code names a project directory after the working directory it ran in. */
function encode(cwd: string): string {
  return cwd.replaceAll("/", "-");
}

async function append(path: string, record: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(record)}\n`, { flag: "a" });
}

/** A Codex rollout whose newest `token_count` carries the plan's own meter, as the real one does. */
export async function writeCodexRateLimits(
  home: string,
  opts: {
    at?: string;
    resetsAt?: number;
    weekResetsAt?: number;
    /** The account figures Codex writes in the same object, for a test that reads them. */
    credits?: number;
    planType?: string;
  } = {},
): Promise<void> {
  const at = opts.at ?? "2026-09-24T11:59:30.000Z";
  const path = join(home, ".codex", "sessions", "2026", "09", "24", "rollout-t-limits.jsonl");
  await append(path, {
    timestamp: at,
    type: "session_meta",
    payload: { id: "t-limits", cwd: "/Users/me/other", originator: "codex_cli_rs" },
  });
  await append(path, {
    timestamp: at,
    type: "event_msg",
    payload: {
      type: "token_count",
      info: { last_token_usage: { input_tokens: 10, output_tokens: 5 } },
      rate_limits: {
        primary: {
          used_percent: 1,
          window_minutes: 300,
          resets_at: opts.resetsAt ?? 1790258700,
        },
        secondary: {
          used_percent: 17,
          window_minutes: 10_080,
          resets_at: opts.weekResetsAt ?? 1790586000,
        },
        ...(opts.credits === undefined
          ? {}
          : {
              credits: { has_credits: true, unlimited: false, balance: opts.credits },
              plan_type: opts.planType,
              spend_control_reached: false,
            }),
      },
    },
  });
}
