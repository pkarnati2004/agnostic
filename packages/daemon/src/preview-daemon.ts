import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { newId, type TaskStatus } from "@agnostic/core";
import type { Ledger, UsageInput } from "@agnostic/ledger";
import { usageWindow } from "@agnostic/usage";
import type { Detection } from "./detection-cache.js";
import { createTestDaemon, TEST_TOKEN } from "./test-daemon.js";
import { fixtureDetection } from "./test-detection.js";
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

// The fixture harness that answers one spec, so Write spec can be tried with no agent installed.
const SPEC_WRITER = fileURLToPath(
  new URL("../../../tests/fixtures/bin/spec/claude", import.meta.url),
);

// Every harness row is pointed at the fixture spec writer, so Write spec answers whichever profile
// the recommender picks.
function previewDetection(): Detection {
  const found = fixtureDetection();
  return { ...found, harnesses: found.harnesses.map((row) => ({ ...row, path: SPEC_WRITER })) };
}

/** Enough rows for the bar and the task header to draw: three plans, two of them on the first repo. */
function seedUsage(ledger: Ledger, taskIds: string[]): void {
  const now = Date.now();
  const week = new Date(usageWindow("week", new Date(now)).since).getTime();
  const today = new Date(now - 60_000).toISOString();
  const earlier = new Date(week + (now - week) / 2).toISOString();
  const [first = null, second = null] = taskIds;
  ledger.usage.record(first, [
    row("c1", { ts: today, harness: "claude-code", model: "claude-sonnet-4.5", tokens: 412_000 }),
    row("c2", { ts: today, harness: "claude-code", model: "claude-fable-1", tokens: 530_000 }),
    row("c3", {
      ts: earlier,
      harness: "claude-code",
      model: "claude-sonnet-4.5",
      tokens: 1_100_000,
    }),
  ]);
  // No task: a session the user started themselves, which the plan's meter counts and agn cannot price.
  ledger.usage.record(null, [
    row("c4", { ts: today, harness: "claude-code", model: "claude-sonnet-4.5", tokens: 61_400 }),
  ]);
  ledger.usage.record(second, [
    row("x1", { ts: today, harness: "codex", model: "gpt-5-codex", tokens: 208_300 }),
    row("x2", { ts: earlier, harness: "codex", model: "gpt-5-codex", tokens: 740_000 }),
    row("o1", { ts: today, harness: "opencode", model: "kimi-k2", tokens: 44_100, costUsd: 2.86 }),
  ]);
}

function row(
  ref: string,
  over: {
    ts: string;
    harness: UsageInput["harness"];
    model: string;
    tokens: number;
    costUsd?: number;
  },
): UsageInput {
  return {
    ts: over.ts,
    harness: over.harness,
    model: over.model,
    tokens: over.tokens,
    tokensInput: Math.round(over.tokens * 0.1),
    tokensOutput: Math.round(over.tokens * 0.2),
    tokensCacheRead: Math.round(over.tokens * 0.7),
    tokensCacheWrite: null,
    costUsd: over.costUsd ?? null,
    source: "transcript",
    ref: `preview-${ref}`,
  };
}

function seedRepo(ledger: Ledger, name: string, path: string, index: number): string[] {
  const addedAt = new Date(Date.UTC(2026, 8, 1 + index)).toISOString();
  const repo = ledger.repos.insert({ id: newId(), path, kind: "git", name, addedAt });
  const ids: string[] = [];
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
    ids.push(id);
  }
  return ids;
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
    detect: () => Promise.resolve(previewDetection()),
    // The fixture harness is a shell script, so it needs a PATH with a shell's tools on it.
    env: { PATH: "/usr/bin:/bin" },
    seed: (ledger) => {
      const ids = repos.map((repo, index) => seedRepo(ledger, repo.name, repo.path, index));
      seedUsage(ledger, ids[0] ?? []);
    },
  });
  // The ChatGPT plan nothing on this machine declares, so the codex cell is labelled like a real one.
  await mkdir(daemon.paths.home, { recursive: true });
  await writeFile(
    daemon.paths.config,
    "plans:\n  chatgpt: plus\nspec_writer: claude-code:sonnet-4.5:native\n",
    "utf8",
  );
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
