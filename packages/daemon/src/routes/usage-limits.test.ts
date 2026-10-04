import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UsageResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";
import {
  writeClaudeTranscript,
  writeCodexRateLimits,
  writeCodexRollout,
} from "../test-transcripts.js";

let daemon: TestDaemon;
let home = "";

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-usage-home-"));
  daemon = await createTestDaemon({ userHome: home });
});

afterEach(async () => {
  await daemon.close();
  await rm(home, { recursive: true, force: true });
});

async function usage(): Promise<UsageResponse> {
  const response = await daemon.request("/usage");
  expect(response.status).toBe(200);
  return (await response.json()) as UsageResponse;
}

/**
 * `GET /usage` bounds its windows at `[midnight, the instant the request arrived)`, so a turn
 * written in the same millisecond as the request would fall outside them.
 */
function aMomentAgo(): string {
  return new Date(Date.now() - 1_000).toISOString();
}

/** Seconds from now, as a harness writes a reset time: an epoch second, not an ISO string. */
function epochIn(seconds: number): number {
  return Math.floor(Date.now() / 1_000) + seconds;
}

describe("GET /usage and the plans' own meters", () => {
  const FIVE_HOUR = epochIn(3_600);
  const WEEK = epochIn(3 * 86_400);

  /** What agn's status-line command leaves behind after one Claude Code turn. */
  async function writeClaudeLimits(): Promise<string> {
    const file = join(daemon.paths.home, "rate-limits", "claude-code.json");
    await mkdir(join(daemon.paths.home, "rate-limits"), { recursive: true });
    await writeFile(
      file,
      JSON.stringify({
        rate_limits: {
          five_hour: { used_percentage: 58, resets_at: FIVE_HOUR },
          seven_day: { used_percentage: 41, resets_at: WEEK },
        },
      }),
      "utf8",
    );
    return file;
  }

  /** The file's mtime is the time the harness said it, so ageing a figure means ageing the file. */
  async function age(file: string, hours: number): Promise<void> {
    const when = new Date(Date.now() - hours * 3_600_000);
    await utimes(file, when, when);
  }

  it("answers with no limits when neither source has written one", async () => {
    expect((await usage()).limits).toEqual([]);
  });

  it("reports one row per harness, with the vendor its plan is billed to", async () => {
    await writeCodexRollout(home, [
      { session: "t-1111", cwd: "/Users/me/other", ts: aMomentAgo() },
    ]);
    await writeCodexRateLimits(home, {
      at: aMomentAgo(),
      resetsAt: FIVE_HOUR,
      weekResetsAt: WEEK,
    });
    await writeClaudeLimits();

    const { limits } = await usage();

    expect(limits).toEqual([
      expect.objectContaining({
        harness: "codex",
        vendor: "chatgpt",
        source: "rollout",
        fiveHour: { usedPercent: 1, resetsAt: iso(FIVE_HOUR), freshness: "current" },
        week: { usedPercent: 17, resetsAt: iso(WEEK), freshness: "current" },
      }),
      expect.objectContaining({
        harness: "claude-code",
        vendor: "claude",
        source: "statusline",
        fiveHour: { usedPercent: 58, resetsAt: iso(FIVE_HOUR), freshness: "current" },
      }),
    ]);
  });

  it("carries the figures a source reported beside its windows", async () => {
    await writeCodexRollout(home, [
      { session: "t-1111", cwd: "/Users/me/other", ts: aMomentAgo() },
    ]);
    await writeCodexRateLimits(home, {
      at: aMomentAgo(),
      resetsAt: FIVE_HOUR,
      weekResetsAt: WEEK,
      credits: 12.5,
      planType: "plus",
    });

    const { limits } = await usage();

    expect(limits[0]?.detail).toMatchObject({
      credits: 12.5,
      planType: "plus",
      spendControlReached: false,
    });
  });

  it("calls both windows approximate once the figure is three hours old", async () => {
    await age(await writeClaudeLimits(), 3);

    const { limits } = await usage();

    expect([limits[0]?.fiveHour?.freshness, limits[0]?.week?.freshness]).toEqual([
      "approximate",
      "approximate",
    ]);
  });

  it("calls a window stale once its reset has passed, however fresh the file is", async () => {
    const file = join(daemon.paths.home, "rate-limits", "claude-code.json");
    await mkdir(join(daemon.paths.home, "rate-limits"), { recursive: true });
    await writeFile(
      file,
      JSON.stringify({
        rate_limits: { five_hour: { used_percentage: 58, resets_at: epochIn(-60) } },
      }),
      "utf8",
    );

    expect((await usage()).limits[0]?.fiveHour?.freshness).toBe("stale");
  });

  it("prices a subscription plan's tokens at API rates alongside the limits", async () => {
    await writeClaudeTranscript(home, [
      { session: "s-rate", cwd: "/Users/me/other", ts: aMomentAgo() },
    ]);
    await writeClaudeLimits();

    const { week, limits } = await usage();

    expect(limits[0]?.harness).toBe("claude-code");
    const claude = week.plans.find((row) => row.harness === "claude-code");
    expect(claude?.usage.costUsd).toBeNull();
    expect(claude?.apiRateUsd).toBeGreaterThan(0);
  });
});

function iso(epochSeconds: number): string {
  return new Date(epochSeconds * 1_000).toISOString();
}
