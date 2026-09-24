import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newId, type PlanLimit, type UsageResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";

let daemon: TestDaemon;
let home = "";

const WORKTREE = "/tmp/agn-usage-limits";

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-usage-home-"));
  daemon = await createTestDaemon({ userHome: home });
  daemon.ledger.repos.insert({
    id: newId(),
    path: "/tmp/alpha",
    kind: "git",
    name: "alpha",
    addedAt: new Date().toISOString(),
    status: "active",
  });
});

afterEach(async () => {
  await daemon.close();
  await rm(home, { recursive: true, force: true });
});

describe("the usage scanner's rate limits", () => {
  const RESET = "2026-09-24T14:05:00.000Z";

  /** A Codex rollout whose one `token_count` line carries the plan's own meter. */
  async function writeLimit(opts: { at: string; percent: number; day: string }): Promise<void> {
    const dir = join(home, ".codex", "sessions", "2026", "09", opts.day);
    await mkdir(dir, { recursive: true });
    const lines = [
      { timestamp: opts.at, type: "session_meta", payload: { id: `s-${opts.day}`, cwd: WORKTREE } },
      {
        timestamp: opts.at,
        type: "event_msg",
        payload: {
          type: "token_count",
          info: { last_token_usage: { input_tokens: 10, output_tokens: 5 } },
          rate_limits: {
            primary: { used_percent: opts.percent, window_minutes: 300, resets_at: 1790258700 },
          },
        },
      },
    ];
    const name = `rollout-2026-09-${opts.day}T00-00-00-s-${opts.day}.jsonl`;
    await writeFile(join(dir, name), `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`, "utf8");
  }

  /** The scanner is reached through a request, which is where it is wired up. */
  async function limits(): Promise<PlanLimit[]> {
    const response = await daemon.request("/usage");
    expect(response.status).toBe(200);
    return ((await response.json()) as UsageResponse).limits;
  }

  it("reports nothing before a scan has read one", async () => {
    expect(await limits()).toEqual([]);
  });

  it("keeps the newest observation per harness across every scan of this process", async () => {
    await writeLimit({ at: "2026-09-23T10:00:00.000Z", percent: 11, day: "23" });
    expect(await limits()).toEqual([
      expect.objectContaining({ harness: "codex", fiveHour: { usedPercent: 11, resetsAt: RESET } }),
    ]);

    await writeLimit({ at: "2026-09-24T10:00:00.000Z", percent: 23, day: "24" });

    expect(await limits()).toEqual([
      expect.objectContaining({ harness: "codex", fiveHour: { usedPercent: 23, resetsAt: RESET } }),
    ]);
  });

  it("keeps the newer observation when an older rollout is read after it", async () => {
    await writeLimit({ at: "2026-09-24T10:00:00.000Z", percent: 23, day: "24" });
    await limits();

    await writeLimit({ at: "2026-09-22T10:00:00.000Z", percent: 4, day: "22" });

    expect((await limits())[0]?.fiveHour?.usedPercent).toBe(23);
  });
});
