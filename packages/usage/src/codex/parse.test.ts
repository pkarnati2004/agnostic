import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NO_LIMIT_DETAIL } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codexParser } from "./parse.js";

const SESSIONS = fileURLToPath(
  new URL("../../../../tests/fixtures/transcripts/codex/sessions/2026/09/11/", import.meta.url),
);

const T1 = "01a09000-0000-7000-8000-00000000000a";
const T2 = "01a09000-0000-7000-8000-00000000000b";

const rollout = (thread: string, at: string) =>
  join(SESSIONS, `rollout-2026-09-11T${at}-${thread}.jsonl`);

describe("codexParser", () => {
  it("reads one turn per token count, keyed by the thread and the turn's place in it", async () => {
    const { turns } = await codexParser.parse(rollout(T1, "14-00-00"));

    expect(turns).toHaveLength(2);
    expect(turns[0]).toEqual({
      harness: "codex",
      sessionId: T1,
      cwd: "/Users/me/code/petal",
      ts: "2026-09-11T14:00:10.000Z",
      model: "gpt-6-astra",
      // Codex counts cached input inside input_tokens; the two buckets are split, never added.
      tokensInput: 200,
      tokensOutput: 50,
      tokensCacheRead: 800,
      tokensCacheWrite: null,
      costUsd: null,
      ref: `codex:${T1}:1`,
    });
    expect(turns[1]).toMatchObject({
      tokensInput: 200,
      tokensCacheRead: 1000,
      costUsd: null,
      ref: `codex:${T1}:2`,
    });
  });

  it("reads each thread on its own, with the directory it ran in", async () => {
    const { turns } = await codexParser.parse(rollout(T2, "18-00-00"));

    expect(turns).toEqual([
      expect.objectContaining({
        sessionId: T2,
        cwd: "/Users/me/code/other",
        tokensInput: 300,
        tokensCacheRead: 0,
        costUsd: null,
        ref: `codex:${T2}:1`,
      }),
    ]);
  });
});

describe("codexParser on records it has not seen before", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agn-usage-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const parse = async (lines: unknown[], name = `rollout-2026-09-11T20-00-00-${T1}.jsonl`) => {
    const path = join(dir, name);
    await writeFile(path, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");
    return codexParser.parse(path);
  };

  const count = (ts: string, last: Record<string, number> | null) => ({
    timestamp: ts,
    type: "event_msg",
    payload: {
      type: "token_count",
      info: last === null ? null : { last_token_usage: last, model_context_window: 272000 },
    },
  });

  it("takes the session id from the file name when the header is missing", async () => {
    const { turns } = await parse([
      count("2026-09-11T20:00:01.000Z", { input_tokens: 10, output_tokens: 2 }),
    ]);

    expect(turns[0]).toMatchObject({ sessionId: T1, cwd: null, model: null });
  });

  it("skips a turn that reported a context total and no buckets, and counts it", async () => {
    // Codex Desktop writes these: a total with nothing agn could price or split.
    const { turns, skipped } = await parse([
      count("2026-09-11T20:00:01.000Z", {
        input_tokens: 0,
        cached_input_tokens: 0,
        output_tokens: 0,
        total_tokens: 194999,
      }),
      count("2026-09-11T20:00:02.000Z", { input_tokens: 7, output_tokens: 1 }),
    ]);

    expect(turns.map((turn) => turn.ref)).toEqual([`codex:${T1}:2`]);
    expect(skipped).toBe(1);
  });

  it("reads last_token_usage even where the cumulative total went backwards", async () => {
    // A context compaction resets Codex's running total mid-session; a delta against the previous
    // event would go negative here. last_token_usage always reports just this turn's own tokens.
    const { turns } = await parse([
      {
        timestamp: "2026-09-11T20:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 5000,
              cached_input_tokens: 4000,
              output_tokens: 200,
            },
            last_token_usage: { input_tokens: 5000, cached_input_tokens: 4000, output_tokens: 200 },
          },
        },
      },
      {
        timestamp: "2026-09-11T20:00:02.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            // Cumulative total dropped after compaction; a naive delta would be negative.
            total_token_usage: { input_tokens: 90, cached_input_tokens: 0, output_tokens: 10 },
            last_token_usage: { input_tokens: 90, cached_input_tokens: 0, output_tokens: 10 },
          },
        },
      },
    ]);

    expect(turns[1]).toMatchObject({ tokensInput: 90, tokensCacheRead: 0, tokensOutput: 10 });
  });

  it("returns the turns before a line that was cut off mid-write", async () => {
    const path = join(dir, `rollout-2026-09-11T21-00-00-${T2}.jsonl`);
    await writeFile(
      path,
      `${JSON.stringify(count("2026-09-11T21:00:01.000Z", { input_tokens: 9, output_tokens: 3 }))}\n{"timestamp":"2026-09-11T21`,
      "utf8",
    );

    expect((await codexParser.parse(path)).turns).toHaveLength(1);
  });
});

const RATE_LIMITS = fileURLToPath(
  new URL("../../../../tests/fixtures/usage/codex-rate-limits.jsonl", import.meta.url),
);

const CREDITS = fileURLToPath(
  new URL("../../../../tests/fixtures/usage/codex-credits.jsonl", import.meta.url),
);

describe("codexParser and the plan's rate limit", () => {
  it("reads the newest rate limit the rollout carried, and leaves the turns alone", async () => {
    const { turns, limit } = await codexParser.parse(RATE_LIMITS);

    expect(turns).toHaveLength(2);
    expect(limit).toEqual({
      harness: "codex",
      fiveHour: { usedPercent: 1, resetsAt: "2026-09-24T14:05:00.000Z" },
      week: { usedPercent: 17, resetsAt: "2026-09-28T09:00:00.000Z" },
      // The timestamp of the record that carried it, not of the file or the scan.
      observedAt: "2026-09-24T11:59:30.000Z",
      source: "rollout",
      // The fixture's `rate_limits` carries a plan name and no credits of its own.
      detail: { ...NO_LIMIT_DETAIL, planType: "pro" },
    });
  });

  it("reports no limit for a rollout that carries none", async () => {
    const { limit } = await codexParser.parse(rollout(T1, "14-00-00"));

    expect(limit).toBeNull();
  });

  it("drops a window whose length is not one agn knows, rather than guessing which it is", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agn-usage-limit-"));
    const file = join(dir, `rollout-2026-09-24T11-00-00-${T1}.jsonl`);
    const text = await readFile(RATE_LIMITS, "utf8");
    await writeFile(file, text.replace('"window_minutes":300', '"window_minutes":60'), "utf8");

    const { limit } = await codexParser.parse(file);

    expect(limit?.fiveHour).toBeNull();
    expect(limit?.week).toEqual({ usedPercent: 17, resetsAt: "2026-09-28T09:00:00.000Z" });
    await rm(dir, { recursive: true, force: true });
  });

  it("reads the account's credit balance, plan and spend control", async () => {
    // Codex writes the balance as a decimal string; a `token_count` record is lost whole if the
    // credits fail to parse, tokens included, so the fixture carries the form Codex writes.
    const { turns, limit } = await codexParser.parse(CREDITS);

    expect(turns).toHaveLength(1);
    expect(limit?.detail).toEqual({
      ...NO_LIMIT_DETAIL,
      credits: 12.5,
      planType: "plus",
      spendControlReached: false,
    });
  });

  it("reads a numeric balance too, and no figure for one that is not a number", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agn-usage-balance-"));
    const file = join(dir, `rollout-2026-09-24T12-00-00-${T1}.jsonl`);
    const text = await readFile(CREDITS, "utf8");
    await writeFile(file, text.replace('"balance":"12.5"', '"balance":12.5'), "utf8");
    expect((await codexParser.parse(file)).limit?.detail.credits).toBe(12.5);

    await writeFile(file, text.replace('"balance":"12.5"', '"balance":"lots"'), "utf8");
    expect((await codexParser.parse(file)).limit?.detail.credits).toBeNull();
    await rm(dir, { recursive: true, force: true });
  });

  it("says unlimited for a balance with no ceiling rather than a figure", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agn-usage-credits-"));
    const file = join(dir, `rollout-2026-09-24T12-00-00-${T1}.jsonl`);
    const text = await readFile(CREDITS, "utf8");
    await writeFile(file, text.replace('"unlimited":false', '"unlimited":true'), "utf8");

    const { limit } = await codexParser.parse(file);

    expect(limit?.detail.credits).toBe("unlimited");
    await rm(dir, { recursive: true, force: true });
  });

  it("reports no detail at all for a rollout that carries only its windows", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agn-usage-windows-"));
    const file = join(dir, `rollout-2026-09-24T13-00-00-${T1}.jsonl`);
    const text = await readFile(RATE_LIMITS, "utf8");
    await writeFile(file, text.replace(',"plan_type":"pro"', ""), "utf8");

    const { limit } = await codexParser.parse(file);

    expect(limit?.detail).toEqual(NO_LIMIT_DETAIL);
    await rm(dir, { recursive: true, force: true });
  });
});
