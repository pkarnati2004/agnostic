import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UsageResponse } from "@agnostic/core";
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

describe("GET /usage and the agents that record nothing", () => {
  /** A machine with two agents installed that write no usage, and one that is not installed. */
  async function withHarnesses(): Promise<UsageResponse> {
    await daemon.close();
    daemon = await createTestDaemon({
      userHome: home,
      detect: () => {
        const detection = fixtureDetection(["sonnet-4.5"], ["claude-code", "kimi", "droid"]);
        return Promise.resolve({
          ...detection,
          harnesses: detection.harnesses.map((report) =>
            report.harness === "droid" ? { ...report, path: null } : report,
          ),
        });
      },
    });
    const response = await daemon.request("/usage");
    expect(response.status).toBe(200);
    return (await response.json()) as UsageResponse;
  }

  it("names the installed agents with no usage source, in registry order", async () => {
    const body = await withHarnesses();

    // Claude Code writes transcripts, and the agent that is not installed is never named.
    expect(body.unavailable).toEqual(["kimi"]);
  });

  it("names none of them on a machine where every agent agn found records usage", async () => {
    expect((await usage()).unavailable).toEqual([]);
  });
});
