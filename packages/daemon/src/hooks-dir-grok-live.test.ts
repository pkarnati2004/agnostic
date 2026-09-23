import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { newId, type Repo, run, type Task } from "@agnostic/core";
import { hookInstaller, writeHookScript } from "@agnostic/hooks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";

/**
 * Grok merges every JSON file under `~/.grok/hooks/` and runs the command each event's entry
 * names; this fixture does the same read-and-run for agn's own `agn.json`, so the chain the real
 * CLI would drive - install, the file on disk, the hook script, curl, the daemon - runs without a
 * Grok subscription (unverified live, per the handoff).
 */
const HARNESS_AGENT = fileURLToPath(
  new URL("../../../tests/fixtures/hooks-dir-agent.sh", import.meta.url),
);

const STOP_PAYLOAD = fileURLToPath(
  new URL("../../../tests/fixtures/hooks/payloads/grok/stop.json", import.meta.url),
);

let daemon: TestDaemon;
let repo: Repo;
let grokHome = "";

beforeEach(async () => {
  daemon = await createTestDaemon();
  // The hook script finds this daemon the way any hook does: through daemon.json and the token.
  await daemon.serve();
  await writeHookScript(daemon.paths);
  repo = await daemon.addRepo();
  // A separate temp directory stands in for $HOME: the daemon's own AGNOSTIC_HOME is not the
  // directory whose dotfiles a hook installer writes into.
  grokHome = await mkdtemp(join(tmpdir(), "agn-grok-home-"));
});

afterEach(async () => {
  await rm(grokHome, { recursive: true, force: true });
  await daemon.close();
});

function seedGrokTask(): Task {
  const now = new Date().toISOString();
  const id = newId();
  daemon.ledger.tasks.insert({
    id,
    repoId: repo.id,
    title: "a task",
    prompt: "do the thing",
    profileId: "grok:default:native",
    worktreePath: null,
    branch: null,
    status: "queued",
    origin: "agn",
    baseCommit: null,
    compareId: null,
    createdAt: now,
    updatedAt: now,
  });
  return daemon.ledger.tasks.start(id, {
    branch: null,
    baseCommit: null,
    session: {
      harness: "grok",
      sessionId: null,
      tmuxSession: `agn-${id}`,
      tmuxSocket: "agn-test",
      launchId: newId(),
      pid: null,
      cwd: repo.path,
      lastSeenAt: now,
    },
  });
}

/** Runs the same three-argument command Grok would, with the payload it would send on stdin. */
async function fireGrok(taskId: string, event: string): Promise<number> {
  const payload = await readFile(STOP_PAYLOAD, "utf8");
  const result = await run("sh", [HARNESS_AGENT, grokHome, "grok", event], {
    input: payload,
    env: { AGN_TASK_ID: taskId, PATH: "/usr/bin:/bin" },
    inheritEnv: false,
    timeoutMs: 10_000,
  });
  return result.exitCode;
}

describe("a hook Grok would send through its hooks directory", () => {
  it("installs agn.json, then moves the task the fixture harness posts for", async () => {
    const installer = hookInstaller("grok");
    if (installer === null) {
      throw new Error("grok has no hook installer");
    }
    const install = await installer.install({
      repoPath: grokHome,
      home: grokHome,
      command: "unused: hooks-dir installers build one command per event",
      paths: daemon.paths,
      env: {},
    });
    expect(install.changed).toBe(true);
    expect(install.file).toBe(join(grokHome, ".grok", "hooks", "agn.json"));

    const task = seedGrokTask();
    expect(await fireGrok(task.id, "Stop")).toBe(0);

    await waitFor(
      "the task to move to waiting",
      () => daemon.ledger.tasks.get(task.id)?.status === "waiting",
      10_000,
    );
    // The same fixture posts Grok's own camelCase sessionId, which the daemon keeps for resume.
    expect(daemon.ledger.tasks.get(task.id)?.session?.sessionId).toBe(
      "019e37f4-5135-7b63-a4ab-6d13aa6bf528",
    );
  });

  it("has nothing left for the fixture to read once uninstall runs", async () => {
    const installer = hookInstaller("grok");
    if (installer === null) {
      throw new Error("grok has no hook installer");
    }
    const input = {
      repoPath: grokHome,
      home: grokHome,
      command: "unused",
      paths: daemon.paths,
      env: {},
    };
    await installer.install(input);
    await installer.uninstall(input);
    const task = seedGrokTask();
    // The fixture agent reads agn.json the way Grok would; once agn removes the file, there is no
    // command left to run for any event, which the fixture reports as its own failure.
    await expect(fireGrok(task.id, "Stop")).rejects.toThrow(/exited with code/);
    expect(daemon.ledger.tasks.get(task.id)?.status).toBe("running");
  });
});
