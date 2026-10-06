import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessId, UsageResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";
import { fixtureDetection } from "../test-detection.js";

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

/** A machine with `installed` on PATH and `missing` detected but nowhere on it. */
async function withHarnesses(installed: HarnessId[], missing: HarnessId[]): Promise<void> {
  await daemon.close();
  daemon = await createTestDaemon({
    userHome: home,
    detect: () => {
      const detection = fixtureDetection(["sonnet-4.5"], [...installed, ...missing]);
      return Promise.resolve({
        ...detection,
        harnesses: detection.harnesses.map((report) =>
          missing.includes(report.harness) ? { ...report, path: null } : report,
        ),
      });
    },
  });
}

describe("GET /usage and the agents on this machine", () => {
  it("splits the installed agents into the ones that record usage and the ones that do not", async () => {
    await withHarnesses(["claude-code", "kimi"], ["droid"]);
    const body = await usage();

    // Claude Code writes transcripts; nothing counts kimi; the agent that is not installed is
    // in neither list.
    expect(body.present).toEqual([{ harness: "claude-code", vendor: "claude", plan: "max20" }]);
    expect(body.unavailable).toEqual(["kimi"]);
  });

  it("keeps a present row for a window that counted nothing", async () => {
    const body = await usage();

    expect(body.day.plans).toEqual([]);
    expect(body.week.plans).toEqual([]);
    expect(body.present.map((row) => row.harness)).toEqual(["claude-code"]);
  });

  it("labels a present row with the plan config.yaml declares, in registry order", async () => {
    await withHarnesses(["codex", "claude-code"], []);
    await writeFile(join(daemon.paths.home, "config.yaml"), "plans:\n  chatgpt: plus\n");
    const body = await usage();

    expect(body.present).toEqual([
      { harness: "claude-code", vendor: "claude", plan: "max20" },
      { harness: "codex", vendor: "chatgpt", plan: "plus" },
    ]);
  });

  it("names none of them on a machine where every agent agn found records usage", async () => {
    expect((await usage()).unavailable).toEqual([]);
  });
});
