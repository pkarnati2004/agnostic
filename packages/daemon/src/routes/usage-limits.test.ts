import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UsageResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";
import { writeCodexRateLimits, writeCodexRollout } from "../test-transcripts.js";

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

describe("GET /usage and the plans' own meters", () => {
  /** What agn's status-line command leaves behind after one Claude Code turn. */
  async function writeClaudeLimits(): Promise<void> {
    await mkdir(join(daemon.paths.home, "rate-limits"), { recursive: true });
    await writeFile(
      join(daemon.paths.home, "rate-limits", "claude-code.json"),
      JSON.stringify({
        rate_limits: {
          five_hour: { used_percentage: 58, resets_at: 1790258700 },
          seven_day: { used_percentage: 41, resets_at: 1790586000 },
        },
      }),
      "utf8",
    );
  }

  it("answers with no limits when neither source has written one", async () => {
    expect((await usage()).limits).toEqual([]);
  });

  it("reports one row per harness, with the vendor its plan is billed to", async () => {
    await writeCodexRollout(home, [
      { session: "t-1111", cwd: "/Users/me/other", ts: aMomentAgo() },
    ]);
    await writeCodexRateLimits(home);
    await writeClaudeLimits();

    const { limits } = await usage();

    expect(limits).toEqual([
      expect.objectContaining({
        harness: "codex",
        vendor: "chatgpt",
        source: "codex-rollout",
        fiveHour: { usedPercent: 1, resetsAt: "2026-09-24T14:05:00.000Z" },
        week: { usedPercent: 17, resetsAt: "2026-09-28T09:00:00.000Z" },
      }),
      expect.objectContaining({
        harness: "claude-code",
        vendor: "claude",
        source: "claude-statusline",
        fiveHour: { usedPercent: 58, resetsAt: "2026-09-24T14:05:00.000Z" },
      }),
    ]);
  });
});
