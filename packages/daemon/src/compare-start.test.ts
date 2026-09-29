import { join } from "node:path";
import {
  defaultRepoConfig,
  newId,
  type Repo,
  type StartCompareResponse,
  writeRepoConfig,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";
import { repoWithConfig } from "./test-task-run.js";

let daemon: TestDaemon;
let repo: Repo;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
  repo = await repoWithConfig(daemon);
});

afterEach(() => daemon.close());

/** A setup command that works once: the second worktree's launch fails where a real one would. */
async function failOnSecondLaunch(): Promise<void> {
  const marker = join(repo.path, "setup-ran");
  await writeRepoConfig(repo.path, {
    ...defaultRepoConfig(newId()),
    defaultProfileId: "claude-code:default:native",
    setupCommand: `test ! -e ${marker} && touch ${marker}`,
  });
}

describe("startCompare", () => {
  it("stops the siblings already running when a later launch fails", async () => {
    await failOnSecondLaunch();
    const response = await daemon.request(`/repos/${repo.id}/compare`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "add a --verbose flag",
        profiles: ["claude-code", "codex", "claude-code:opus:native"],
      }),
    });
    expect(response.ok).toBe(false);

    // Oldest first: the one that launched, the one whose setup failed, and no third.
    const rows = daemon.ledger.tasks.list().reverse();
    expect(rows.map((task) => task.status)).toEqual(["stopped", "failed"]);
    expect(rows.map((task) => task.profileId)).toEqual([
      "claude-code:default:native",
      "codex:default:native",
    ]);
    // The stopped sibling keeps its worktree, as any stopped task does.
    expect(rows[0]?.worktreePath).not.toBeNull();
  });

  it("starts every sibling under one compare when nothing refuses", async () => {
    const response = await daemon.request(`/repos/${repo.id}/compare`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "add a --verbose flag",
        title: "Verbose flag",
        profiles: ["claude-code", "codex", "claude-code:opus:native"],
      }),
    });
    expect(response.status).toBe(201);
    const { compareId, tasks } = (await response.json()) as StartCompareResponse;
    expect(tasks.map((task) => task.title)).toEqual([
      "Verbose flag",
      "Verbose flag",
      "Verbose flag",
    ]);
    expect(daemon.ledger.tasks.list({ compareId })).toHaveLength(3);
  });
});
