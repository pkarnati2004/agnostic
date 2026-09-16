import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  agnosticPaths,
  type ExecutorProvider,
  type PrepareInput,
  type SessionHandle,
  sessionHandle,
} from "@agnostic/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTmuxExecutor } from "./executor.js";
import { createGitRepo, testTask } from "./test-repo.js";
import { createTestTmux, type TestTmux, waitFor } from "./test-tmux.js";
import { tmuxConfig } from "./tmux-config.js";

const FAKE_AGENT = fileURLToPath(new URL("../../../tests/fixtures/fake-agent.sh", import.meta.url));

let tmux: TestTmux;
let executor: ExecutorProvider;

beforeAll(async () => {
  tmux = await createTestTmux();
  executor = await tmux.executor();
});

afterAll(async () => {
  await tmux.cleanup();
});

function handle(taskId: string, socket: string | null): SessionHandle {
  return { taskId, tmuxSession: `agn-${taskId}`, tmuxSocket: socket, launchId: null, cwd: "/tmp" };
}

describe("createTmuxExecutor", () => {
  it("is the tmux-local provider and refuses the user's own server", async () => {
    expect(executor.id).toBe("tmux-local");
    await expect(
      createTmuxExecutor({ paths: tmux.paths, socketName: "default", env: tmux.env }),
    ).rejects.toThrowError(/default/);
  });

  it("writes agn's tmux config before anything can start a server", async () => {
    // Which of the two terminal names it carries is this machine's terminfo, not the executor's.
    const written = await readFile(tmux.paths.tmuxConf, "utf8");
    expect([tmuxConfig("tmux-256color"), tmuxConfig("screen-256color")]).toContain(written);
  });
});

describe("attach", () => {
  it("names agn's config and the socket the session was created on", () => {
    expect(executor.attach(handle("t3n9v2wxyz", "agn"))).toEqual({
      kind: "tmux",
      argv: [
        "tmux",
        "-u",
        "-f",
        tmux.paths.tmuxConf,
        "-L",
        "agn",
        "attach-session",
        "-t",
        "agn-t3n9v2wxyz",
      ],
    });
  });

  it("omits -f and -L for an adopted session on the default server", () => {
    expect(executor.attach(handle("t3n9v2wxyz", null)).argv).toEqual([
      "tmux",
      "-u",
      "attach-session",
      "-t",
      "agn-t3n9v2wxyz",
    ]);
  });
});

describe("a task from prepare to clean", () => {
  it("works in its own worktree, stays there after stop, and is gone after clean", async () => {
    const repo = await createGitRepo();
    const task = testTask(repo);
    const input: PrepareInput = {
      task,
      repo,
      base: null,
      branch: null,
      branchPrefix: null,
      setupCommand: null,
      logFile: null,
    };
    const prepared = await executor.prepare(input);
    const log = join(prepared.cwd, "agent.log");
    const live = await executor.launch({
      taskId: task.id,
      cwd: prepared.cwd,
      command: {
        command: FAKE_AGENT,
        args: ["--log", log],
        env: tmux.env,
        promptAfterStart: null,
      },
    });
    await waitFor("the agent is ready", async () =>
      (await readFile(log, "utf8").catch(() => "")).includes("ready"),
    );
    expect(await executor.sessionState(live)).toBe("running");
    // What the daemon stores and rebuilds the handle from is the same thing launch returned.
    const stored = sessionHandle({
      ...task,
      worktreePath: prepared.cwd,
      branch: prepared.branch,
      session: {
        harness: "claude-code",
        sessionId: null,
        tmuxSession: live.tmuxSession,
        tmuxSocket: live.tmuxSocket,
        launchId: live.launchId,
        pid: null,
        cwd: live.cwd,
        lastSeenAt: task.updatedAt,
      },
    });
    expect(stored).toEqual(live);
    await executor.stop(live);
    await waitFor(
      "the session is gone",
      async () => (await executor.sessionState(live)) === "gone",
    );
    await expect(stat(prepared.cwd)).resolves.toBeTruthy();

    await executor.clean({
      task: { ...task, worktreePath: prepared.cwd, branch: prepared.branch },
      repo,
      deleteBranch: false,
    });
    await expect(stat(prepared.cwd)).rejects.toThrowError();
  }, 40_000);
});

describe("sessionState", () => {
  it("is gone for a session that was never created", async () => {
    expect(await executor.sessionState(handle("nosuchtask", tmux.socketName))).toBe("gone");
  });

  it("is exited, not gone, for a dead pane the watcher has not reaped yet", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agn-alive-"));
    // No watcher: the dead session stays until something asks about it.
    const unwatched = await createTmuxExecutor({
      paths: { ...tmux.paths, sessions: join(tmux.home, "sessions-alive") },
      socketName: tmux.socketName,
      env: tmux.env,
    });
    await unwatched.close();
    const live = await unwatched.launch({
      taskId: "alivewxyzz",
      cwd,
      command: {
        command: FAKE_AGENT,
        args: ["--exit-after", "1"],
        env: tmux.env,
        promptAfterStart: null,
      },
    });
    expect(await unwatched.sessionState(live)).toBe("running");
    // "exited" is the state that tells the daemon an exit code is still owed to this task.
    await waitFor(
      "the pane dies",
      async () => (await unwatched.sessionState(live)) === "exited",
      10_000,
    );
  });

  it("is gone for a dead pane of a session agn never launched", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agn-adopted-"));
    const unwatched = await createTmuxExecutor({
      paths: { ...tmux.paths, sessions: join(tmux.home, "sessions-adopted") },
      socketName: tmux.socketName,
      env: tmux.env,
    });
    await unwatched.close();
    const live = await unwatched.launch({
      taskId: "adoptedwxy",
      cwd,
      command: {
        command: FAKE_AGENT,
        args: ["--exit-after", "1"],
        env: tmux.env,
        promptAfterStart: null,
      },
    });
    // An adopted session's row carries no launch id, so no pane-died hook will ever write its
    // exit file: once its pane is dead there is nothing more coming.
    const adopted: SessionHandle = { ...live, launchId: null };
    await waitFor(
      "the pane dies",
      async () => (await unwatched.sessionState(adopted)) === "gone",
      10_000,
    );
  });
});

describe("the default client env (no `env` override)", () => {
  it("never contains TMUX or TMUX_PANE, even when the daemon process has them set", async () => {
    // A `tmux` on PATH that records whatever env it actually ran with; it never talks to a server.
    const dir = await mkdtemp(join(tmpdir(), "agn-clientenv-stub-"));
    const script = join(dir, "tmux");
    await writeFile(
      script,
      `#!/bin/sh\nprintf '%s' "\${TMUX-unset}|\${TMUX_PANE-unset}" > "${dir}/env"\nexit 0\n`,
    );
    await chmod(script, 0o755);
    const home = await mkdtemp(join(tmpdir(), "agn-clientenv-home-"));
    const savedPath = process.env.PATH;
    const savedTmux = process.env.TMUX;
    const savedPane = process.env.TMUX_PANE;
    // A leaked TMUX/TMUX_PANE would point agn's own client at whatever server started it.
    process.env.PATH = `${dir}:${savedPath ?? ""}`;
    process.env.TMUX = "/tmp/leaked-session,1,0";
    process.env.TMUX_PANE = "%3";
    let leaky: ExecutorProvider | null = null;
    try {
      leaky = await createTmuxExecutor({
        paths: agnosticPaths(home),
        socketName: "agn-clientenv-test",
      });
      await leaky.sessionState({
        taskId: "clientenvxy",
        tmuxSession: "agn-clientenvxy",
        tmuxSocket: "agn-clientenv-test",
        launchId: null,
        cwd: home,
      });
    } finally {
      process.env.PATH = savedPath;
      if (savedTmux === undefined) {
        delete process.env.TMUX;
      } else {
        process.env.TMUX = savedTmux;
      }
      if (savedPane === undefined) {
        delete process.env.TMUX_PANE;
      } else {
        process.env.TMUX_PANE = savedPane;
      }
      await leaky?.close();
    }
    expect(await readFile(join(dir, "env"), "utf8")).toBe("unset|unset");
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });
});
