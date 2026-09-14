import type { TaskResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";
import { fixtureDetection } from "./test-detection.js";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
});

afterEach(() => daemon.close());

/** A run is the only caller that can refuse a profile, so the rule is tested through one. */
async function run(on: TestDaemon, profile: string): Promise<Response> {
  const repo = await on.addRepo();
  return on.request(`/repos/${repo.id}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "ship it", profile }),
  });
}

describe("the harness a profile names", () => {
  it("refuses one that is installed nowhere, without creating a task", async () => {
    const response = await run(daemon, "pi");

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("harness-not-installed");
    expect(daemon.ledger.tasks.list()).toHaveLength(0);
  });

  it("accepts one PATH has now, which the detection it cached has no path for", async () => {
    // Detection is a cache of a machine that changes under it: the first run after an install
    // must not be refused because the run before it found nothing.
    const stale = await createTestDaemon({
      tmux: true,
      detect: () => {
        const detection = fixtureDetection();
        return Promise.resolve({
          ...detection,
          harnesses: detection.harnesses.map((report) => ({ ...report, path: null })),
        });
      },
    });
    try {
      const response = await run(stale, "claude-code");

      expect(response.status).toBe(201);
      expect(((await response.json()) as TaskResponse).task.status).toBe("running");
    } finally {
      await stale.close();
    }
  });
});
