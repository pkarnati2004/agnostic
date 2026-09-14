import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { createTestDaemon, waitFor } from "./test-daemon.js";
import { createWorkspace } from "./test-workspace.js";

// What a daemon does at start with the rows the daemon before it left behind (ADR 014).
const PROFILE = "claude-code:default:native";

describe("start-up sweep of queued tasks", () => {
  it("fails a task left queued by a daemon that died, and takes its worktree back", async () => {
    const id = "qrstuvwxyz";
    const repoPath = await createWorkspace({});
    const parent = await mkdtemp(join(tmpdir(), "agn-queued-"));
    const worktree = join(parent, "tree");
    await run("git", ["-C", repoPath, "worktree", "add", "-q", "-b", `agn/${id}`, worktree]);
    const seeded = await createTestDaemon({
      tmux: true,
      seed: (ledger) => {
        const now = new Date().toISOString();
        ledger.repos.insert({
          id: "qqqqqqqqqq",
          path: repoPath,
          kind: "git",
          name: "q",
          addedAt: now,
        });
        ledger.tasks.insert({
          id,
          repoId: "qqqqqqqqqq",
          title: "never launched",
          prompt: "p",
          profileId: PROFILE,
          worktreePath: worktree,
          branch: null,
          status: "queued",
          origin: "agn",
          baseCommit: null,
          createdAt: now,
          updatedAt: now,
        });
      },
    });
    try {
      await waitFor(
        "the start-up sweep to fail it",
        () => seeded.ledger.tasks.get(id)?.status === "failed",
      );
      await waitFor("the worktree to be removed", () =>
        stat(worktree).then(
          () => false,
          () => true,
        ),
      );
      const events = seeded.ledger.events.forTask(id);
      expect(events.filter((event) => event.kind === "task.status")).toMatchObject([
        { payload: { from: "queued", to: "failed" } },
      ]);
      expect(events.some((event) => event.kind === "task.cleaned")).toBe(true);
    } finally {
      await seeded.close();
      await rm(repoPath, { recursive: true, force: true });
      await rm(parent, { recursive: true, force: true });
    }
  });
});

describe("start-up reconcile", () => {
  it("stops a task the ledger calls running when its session is gone", async () => {
    const id = "mnpqrstuvw";
    const seeded = await createTestDaemon({
      tmux: true,
      seed: (ledger) => {
        const now = new Date().toISOString();
        ledger.repos.insert({
          id: "rrrrrrrrrr",
          path: "/tmp",
          kind: "git",
          name: "r",
          addedAt: now,
        });
        ledger.tasks.insert({
          id,
          repoId: "rrrrrrrrrr",
          title: "left over from last boot",
          prompt: "p",
          profileId: PROFILE,
          worktreePath: null,
          branch: null,
          status: "running",
          origin: "agn",
          baseCommit: null,
          createdAt: now,
          updatedAt: now,
        });
        ledger.tasks.setSession(id, {
          harness: "claude-code",
          sessionId: null,
          tmuxSession: `agn-${id}`,
          tmuxSocket: null,
          launchId: null,
          pid: null,
          cwd: "/tmp",
          lastSeenAt: now,
        });
      },
    });
    try {
      await waitFor(
        "the start-up reconcile to stop it",
        () => seeded.ledger.tasks.get(id)?.status === "stopped",
      );
    } finally {
      await seeded.close();
    }
  });
});
