import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newId, type TaskStatus } from "@agnostic/core";
import type { Ledger } from "@agnostic/ledger";
import { createTestDaemon, TEST_TOKEN } from "./test-daemon.js";
import { resolveUiDist } from "./ui-dist.js";

/**
 * A daemon with a fixed set of repos and tasks, for looking at the workspace page without running
 * anything. Everything it owns is a temp directory on a random port: no executor, no harness, and
 * never the port or the tmux socket a real agn uses.
 */
const REPOS = ["petal", "katha"];

const CLAUDE = "claude-code:sonnet-4.5:native";
const CODEX = "codex:gpt-5-codex:native";

const TASKS: { status: TaskStatus; title: string; profileId: string }[] = [
  { status: "waiting", title: "Add the retry budget", profileId: CLAUDE },
  { status: "running", title: "Port the parser to zod", profileId: CODEX },
  { status: "queued", title: "Rename the config keys", profileId: CLAUDE },
  { status: "done", title: "Cache the catalog rows", profileId: CODEX },
  { status: "failed", title: "Upgrade the tmux client", profileId: CLAUDE },
  { status: "stopped", title: "Split the usage scanner", profileId: CODEX },
];

const DEV_PORT = 5173;

function seedRepo(ledger: Ledger, name: string, path: string, index: number): void {
  const addedAt = new Date(Date.UTC(2026, 8, 1 + index)).toISOString();
  const repo = ledger.repos.insert({ id: newId(), path, kind: "git", name, addedAt });
  for (const [position, { status, title, profileId }] of TASKS.entries()) {
    const id = newId();
    // Yesterday, so the statuses set below carry today's timestamps and the list sorts as it would.
    const at = new Date(Date.UTC(2026, 8, 13, 9, position * 7)).toISOString();
    ledger.tasks.insert({
      id,
      repoId: repo.id,
      title,
      prompt: title.toLowerCase(),
      profileId,
      worktreePath: join(path, ".worktree", id),
      branch: `agn/${title.toLowerCase().replaceAll(" ", "-")}`,
      status: "queued",
      origin: "agn",
      baseCommit: null,
      createdAt: at,
      updatedAt: at,
    });
    // No session is captured, so the reconcile at start leaves running and waiting where they are.
    if (status !== "queued") {
      ledger.tasks.setStatus(id, status);
    }
  }
}

async function main(): Promise<void> {
  const repos = await Promise.all(
    REPOS.map(async (name) => ({
      name,
      path: await mkdtemp(join(tmpdir(), `agn-preview-${name}-`)),
    })),
  );
  // The build in this checkout, so the printed /ui address serves the same page the daemon does.
  const dist = resolveUiDist();
  const daemon = await createTestDaemon({
    ...(dist === null ? {} : { uiDist: dist }),
    seed: (ledger) => {
      for (const [index, repo] of repos.entries()) {
        seedRepo(ledger, repo.name, repo.path, index);
      }
    },
  });
  const url = await daemon.serve();
  const port = new URL(url).port;
  console.log(`DAEMON_PORT=${port}`);
  console.log(`http://127.0.0.1:${port}/ui#token=${TEST_TOKEN}`);
  console.log(`with the Vite dev server: http://127.0.0.1:${DEV_PORT}/ui/#token=${TEST_TOKEN}`);
  process.once("SIGINT", () => {
    void (async () => {
      await daemon.close();
      await Promise.all(repos.map(({ path }) => rm(path, { recursive: true, force: true })));
      process.exit(0);
    })();
  });
}

await main();
