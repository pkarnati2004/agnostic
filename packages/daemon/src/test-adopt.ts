import { chmod, copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type DetectedHarness,
  newId,
  type Repo,
  run,
  type SessionsResponse,
  spawn,
  type Task,
} from "@agnostic/core";
import { type TestDaemon, waitFor } from "./test-daemon.js";

// Not part of the package's exports: this is how an adopt test gets a session agn did not start.
const FAKE_AGENT = fileURLToPath(new URL("../../../tests/fixtures/fake-agent.sh", import.meta.url));

export type FakeSessions = {
  /** The pid of a fake harness started in `cwd`, the way a person starts one in a terminal. */
  outsideTmux(cwd: string, args?: string[]): Promise<number>;
  underTmux(cwd: string, session: string): Promise<void>;
  list(repo: Repo, path: string): Promise<Response>;
  /** Detection reads the process table, so a just-spawned agent takes a moment to turn up. */
  waitForCount(repo: Repo, path: string, count: number): Promise<DetectedHarness[]>;
  killAll(): Promise<void>;
};

/** Built per test, after the daemon it spawns its agents against. */
export function fakeSessions(daemon: TestDaemon): FakeSessions {
  const agents: ReturnType<typeof spawn>[] = [];

  /** ps reports the script's own name, so the fake agent is copied to the name detection matches. */
  const harnessNamed = async (name: string): Promise<string> => {
    const bin = join(daemon.paths.home, "detect-bin");
    await mkdir(bin, { recursive: true });
    const path = join(bin, name);
    await copyFile(FAKE_AGENT, path);
    await chmod(path, 0o755);
    return path;
  };

  const list = (repo: Repo, path: string): Promise<Response> =>
    daemon.request(`/repos/${repo.id}/sessions?path=${encodeURIComponent(path)}`);

  const listed = async (repo: Repo, path: string): Promise<DetectedHarness[]> => {
    const response = await list(repo, path);
    if (response.status !== 200) {
      throw new Error(`the sessions under ${path} were refused: ${await response.text()}`);
    }
    return ((await response.json()) as SessionsResponse).sessions;
  };

  return {
    outsideTmux: async (cwd, args = []) => {
      await mkdir(cwd, { recursive: true });
      const agent = spawn(await harnessNamed("claude"), args, {
        cwd,
        env: daemon.launch?.env ?? {},
        inheritEnv: false,
      });
      agents.push(agent);
      return agent.pid ?? 0;
    },

    underTmux: async (cwd, session) => {
      await mkdir(cwd, { recursive: true });
      const socket = daemon.launch?.socketName ?? "";
      const argv = ["-L", socket, "new-session", "-d", "-s", session, "-c", cwd];
      await run("tmux", [...argv, await harnessNamed("claude")], {
        env: daemon.launch?.env ?? {},
        inheritEnv: false,
      });
    },

    list,

    waitForCount: async (repo, path, count) => {
      await waitFor(
        `${count} session(s) under ${path}`,
        async () => (await listed(repo, path)).length === count,
      );
      return await listed(repo, path);
    },

    killAll: async () => {
      for (const agent of agents) {
        agent.kill("SIGKILL");
      }
      await Promise.allSettled(agents);
      agents.length = 0;
    },
  };
}

export function errorOf(response: Response): Promise<{ error: { code: string; message: string } }> {
  return response.json() as Promise<{ error: { code: string; message: string } }>;
}

/** A task row as an adopt writes one, for the states a live detection can no longer reproduce. */
export function seedAdopted(daemon: TestDaemon, repo: Repo, pid: number, cwd: string): Task {
  const now = new Date().toISOString();
  const task = daemon.ledger.tasks.insert({
    id: newId(),
    repoId: repo.id,
    title: "adopted claude-code session",
    prompt: "",
    profileId: "claude-code:default:native",
    worktreePath: null,
    branch: "main",
    status: "running",
    origin: "adopted",
    baseCommit: null,
    createdAt: now,
    updatedAt: now,
  });
  return daemon.ledger.tasks.setSession(task.id, {
    harness: "claude-code",
    sessionId: null,
    tmuxSession: null,
    tmuxSocket: null,
    launchId: null,
    pid,
    cwd,
    lastSeenAt: now,
  });
}
