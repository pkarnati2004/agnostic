import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newId, type Task, type TaskSession, type TaskStatus } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";
import { fixtureDetection } from "./test-detection.js";
import { writeClaudeTranscript, writeCodexRollout } from "./test-transcripts.js";

let daemon: TestDaemon;
let home = "";
let repoId = "";

const WORKTREE = "/tmp/agn-usage-worktree";

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-usage-home-"));
  daemon = await createTestDaemon({ userHome: home });
  repoId = newId();
  daemon.ledger.repos.insert({
    id: repoId,
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

function seedTask(opts: {
  session?: Partial<TaskSession>;
  profileId?: string;
  status?: TaskStatus;
  startedAt?: string;
  updatedAt?: string;
}): Task {
  const now = new Date().toISOString();
  return daemon.ledger.tasks.insert({
    id: newId(),
    repoId,
    title: "ship the thing",
    prompt: "a prompt that must never reach the log",
    profileId: opts.profileId ?? "claude-code:default:native",
    worktreePath: WORKTREE,
    branch: null,
    status: opts.status ?? "running",
    origin: "agn",
    baseCommit: null,
    compareId: null,
    createdAt: opts.startedAt ?? new Date(Date.now() - 60_000).toISOString(),
    updatedAt: opts.updatedAt ?? now,
    session: {
      harness: "claude-code",
      sessionId: "s-aaaa",
      tmuxSession: "agn-x",
      tmuxSocket: null,
      launchId: null,
      pid: null,
      cwd: WORKTREE,
      lastSeenAt: now,
      ...opts.session,
    },
  });
}

function everyRow() {
  return daemon.ledger.usage.summarize({
    since: "2000-01-01T00:00:00.000Z",
    until: "2099-01-01T00:00:00.000Z",
  });
}

/** The scanner is reached through a request, which is where it is wired up. */
async function scan(): Promise<number> {
  const response = await daemon.request("/usage");
  expect(response.status).toBe(200);
  return everyRow().length;
}

describe("the daemon while a scan runs", () => {
  it("answers /health before a scan of a large transcript tree has finished", async () => {
    // Enough files that the scan takes hundreds of milliseconds: a scan that never handed the
    // event loop back would hold every other request for that whole time.
    await writeClaudeTranscript(
      home,
      Array.from({ length: 3_000 }, (_unused, index) => ({
        session: `s-${index}`,
        cwd: WORKTREE,
        message: `${index}`,
      })),
    );
    let scanned = false;
    const scanning = daemon.request("/usage").then((response) => {
      scanned = true;
      return response;
    });

    const started = Date.now();
    const health = await daemon.request("/health");

    expect(health.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(200);
    expect(scanned).toBe(false);
    expect((await scanning).status).toBe(200);
  });
});

describe("the usage scanner", () => {
  it("takes one detection snapshot per scan, however many tasks it prices", async () => {
    // A harness that rewrites its auth file as it runs makes every cached detection stale, which
    // is what a real Claude Code session does while a task is open.
    await daemon.close();
    const authFile = join(home, ".claude.json");
    daemon = await createTestDaemon({
      userHome: home,
      detect: async () => {
        await writeFile(authFile, JSON.stringify({ rewritten: Date.now() }), "utf8");
        return fixtureDetection();
      },
    });
    repoId = newId();
    daemon.ledger.repos.insert({
      id: repoId,
      path: "/tmp/alpha",
      kind: "git",
      name: "alpha",
      addedAt: new Date().toISOString(),
      status: "active",
    });
    seedTask({});
    await writeClaudeTranscript(home, [{ session: "s-aaaa", cwd: WORKTREE }]);

    const before = daemon.detectCalls();
    await scan();
    const forOneTask = daemon.detectCalls() - before;
    for (let more = 0; more < 4; more += 1) {
      seedTask({ session: { sessionId: `s-${more}` } });
    }
    const beforeMany = daemon.detectCalls();
    await scan();

    expect(daemon.detectCalls() - beforeMany).toBe(forOneTask);
  });

  it("gives a turn to the task whose session id it carries", async () => {
    const task = seedTask({ session: { cwd: "/somewhere/else" } });
    await writeClaudeTranscript(home, [{ session: "s-aaaa", cwd: "/private/tmp/petal" }]);

    await scan();

    expect(daemon.ledger.usage.sumForTask(task.id)).toMatchObject({ tokens: 1_500 });
  });

  it("gives a turn to the task that held its directory at the time", async () => {
    const task = seedTask({ session: { sessionId: null } });
    await writeClaudeTranscript(home, [{ session: "s-unknown", cwd: WORKTREE }]);

    await scan();

    expect(daemon.ledger.usage.sumForTask(task.id)).toMatchObject({ tokens: 1_500 });
  });

  it("leaves a session agn did not start without a task", async () => {
    const task = seedTask({});
    await writeClaudeTranscript(home, [{ session: "s-stranger", cwd: "/Users/me/elsewhere" }]);

    await scan();

    expect(daemon.ledger.usage.sumForTask(task.id)).toMatchObject({ tokens: 0 });
    expect(everyRow()).toEqual([
      expect.objectContaining({ attributed: false, tokens: 1_500, costUsd: null }),
    ]);
  });

  it("inserts nothing the second time it reads the same turns", async () => {
    seedTask({});
    await writeClaudeTranscript(home, [{ session: "s-aaaa", cwd: WORKTREE }]);

    await scan();
    const rows = await scan();

    expect(rows).toBe(1);
    const recorded = daemon.ledger.events
      .after(0, 1_000)
      .filter((event) => event.kind === "usage.recorded");
    expect(recorded).toHaveLength(1);
  });

  it("prices a task that runs on a key and not one that runs on a plan", async () => {
    const metered = seedTask({ profileId: "claude-code:claude-fable-5-1:openrouter" });
    const included = seedTask({
      profileId: "claude-code:default:native",
      session: { sessionId: "s-bbbb" },
    });
    await writeClaudeTranscript(home, [
      { session: "s-aaaa", cwd: WORKTREE, message: "a", input: 1_000_000, output: 0 },
      { session: "s-bbbb", cwd: WORKTREE, message: "b" },
    ]);

    await scan();

    expect(daemon.ledger.usage.sumForTask(metered.id).costUsd).toBe(10);
    expect(daemon.ledger.usage.sumForTask(included.id).costUsd).toBeNull();
  });

  it("reads both harnesses' transcripts", async () => {
    seedTask({});
    await writeClaudeTranscript(home, [{ session: "s-aaaa", cwd: WORKTREE }]);
    await writeCodexRollout(home, [{ session: "t-1111", cwd: "/Users/me/other" }]);

    await scan();

    const harnessesSeen = everyRow().map((row) => row.harness);
    expect(harnessesSeen).toEqual(["claude-code", "codex"]);
  });

  it("records no row for a Codex turn that reported a total and no buckets, and counts it", async () => {
    seedTask({});
    await writeCodexRollout(home, [
      { session: "t-2222", cwd: WORKTREE, input: 0, output: 0, cacheRead: 0 },
    ]);

    const rows = await scan();

    expect(rows).toBe(0);
    expect(await daemon.readLog()).toContain("usage turns without a token split turns=1");
  });

  it("logs a directory it cannot read and still answers", async () => {
    seedTask({});
    await writeClaudeTranscript(home, [{ session: "s-aaaa", cwd: WORKTREE }]);
    await chmod(join(home, ".claude", "projects"), 0o000);

    const response = await daemon.request("/usage");

    expect(response.status).toBe(200);
    expect(await daemon.readLog()).toContain("usage scan problem");
    await chmod(join(home, ".claude", "projects"), 0o755);
  });
});
