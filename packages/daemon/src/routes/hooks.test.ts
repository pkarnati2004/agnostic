import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type HooksInstallResponse, newId, type Repo } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";
import { fixtureDetection } from "../test-detection.js";

let daemon: TestDaemon;
let repo: Repo;

beforeEach(async () => {
  // Both tier-1 harnesses installed, so "every harness that has a hook" is more than one row.
  daemon = await createTestDaemon({
    detect: () => Promise.resolve(fixtureDetection(["sonnet-4.5"], ["claude-code", "codex"])),
  });
  repo = await daemon.addRepo();
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await daemon.close();
});

function install(body: Record<string, string> = {}): Promise<Response> {
  return daemon.request(`/repos/${repo.id}/hooks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /repos/:id/hooks", () => {
  it("installs for one named harness, into the repo", async () => {
    const response = await install({ harness: "claude-code" });
    expect(response.status).toBe(200);
    const { installs } = (await response.json()) as HooksInstallResponse;
    expect(installs).toEqual([
      {
        harness: "claude-code",
        file: join(repo.path, ".claude", "settings.local.json"),
        changed: true,
        verify: null,
      },
    ]);
    const settings = await readFile(installs[0]?.file ?? "", "utf8");
    expect(settings).toContain(join(daemon.paths.hooks, "post.sh"));
    expect(settings).not.toContain("Bearer");
  });

  it("writes the hook script agn's config points at", async () => {
    await install({ harness: "claude-code" });
    expect(await readFile(join(daemon.paths.hooks, "post.sh"), "utf8")).toContain("curl");
  });

  it("installs for every harness that has a hook when none is named", async () => {
    const { installs } = (await (await install()).json()) as HooksInstallResponse;
    expect(installs.map((result) => result.harness).sort()).toEqual(["claude-code", "codex"]);
  });

  it("refuses a harness that has no installer", async () => {
    const response = await install({ harness: "other:mytool" });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "hook-unsupported" } });
  });

  it("refuses a body that is not a request", async () => {
    const response = await install({ harnes: "codex" });
    expect(response.status).toBe(400);
  });

  it("installs into the checkout and a live task's worktree, one result per file", async () => {
    const worktree = await mkdtemp(join(tmpdir(), "agn-worktree-"));
    try {
      const now = new Date().toISOString();
      const id = newId();
      daemon.ledger.tasks.insert({
        id,
        repoId: repo.id,
        title: "a task",
        prompt: "do the thing",
        profileId: "claude-code:default:native",
        worktreePath: worktree,
        branch: null,
        status: "queued",
        origin: "agn",
        baseCommit: null,
        createdAt: now,
        updatedAt: now,
      });
      daemon.ledger.tasks.start(id, {
        branch: null,
        baseCommit: null,
        session: {
          harness: "claude-code",
          sessionId: null,
          tmuxSession: `agn-${id}`,
          tmuxSocket: "agn-test",
          launchId: newId(),
          pid: null,
          cwd: worktree,
          lastSeenAt: now,
        },
      });

      const { installs } = (await (
        await install({ harness: "claude-code" })
      ).json()) as HooksInstallResponse;
      expect(installs.map((result) => result.file).sort()).toEqual(
        [
          join(repo.path, ".claude", "settings.local.json"),
          join(worktree, ".claude", "settings.local.json"),
        ].sort(),
      );

      // Codex's file is per user, so the same two directories collapse to the one install.
      const codex = (await (await install({ harness: "codex" })).json()) as HooksInstallResponse;
      expect(codex.installs).toHaveLength(1);
    } finally {
      await rm(worktree, { recursive: true, force: true });
    }
  });
});
