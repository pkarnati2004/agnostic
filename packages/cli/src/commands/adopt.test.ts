import {
  type AdoptRequest,
  DaemonApiError,
  type DetectedHarness,
  type RepoListRow,
  type Task,
} from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { runMain } from "../program.js";
import { createTestContext } from "../test-context.js";
import { adoptCommand } from "./adopt.js";

const repo: RepoListRow = {
  id: "r7k2m4pqrs",
  name: "api",
  path: "/work/api",
  kind: "git",
  addedAt: "2026-09-11T10:00:00.000Z",
  status: "active",
  testCommand: null,
  pathPresent: true,
};

const task: Task = {
  id: "t3n9v2wxyz",
  repoId: repo.id,
  title: "adopted claude-code session in api",
  prompt: "",
  profileId: "claude-code:default:native",
  worktreePath: null,
  branch: "main",
  status: "running",
  origin: "adopted",
  baseCommit: null,
  compareId: null,
  createdAt: "2026-09-11T10:00:00.000Z",
  updatedAt: "2026-09-11T10:00:00.000Z",
};

function session(pid: number, tmux: DetectedHarness["tmux"]): DetectedHarness {
  return { harness: "claude-code", pid, cwd: "/work/api/sub", args: ["claude"], tmux };
}

function cli(sessions: DetectedHarness[]) {
  const adopted: { repoId: string; body: AdoptRequest }[] = [];
  const test = createTestContext({
    cwd: "/work",
    client: {
      listRepos: () => Promise.resolve({ repos: [repo], cursor: 0 }),
      listSessions: () => Promise.resolve({ sessions }),
      adoptTask: (repoId, body) => {
        adopted.push({ repoId, body });
        return Promise.resolve({ task });
      },
    },
  });
  return { ...test, adopted };
}

describe("agn adopt", () => {
  it("adopts the only session it finds, in the repo the path belongs to", async () => {
    const test = cli([session(4211, null)]);
    await adoptCommand(test.ctx).parseAsync(["api/sub"], { from: "user" });
    expect(test.adopted).toEqual([{ repoId: repo.id, body: { path: "/work/api/sub", pid: 4211 } }]);
    expect(test.out).toEqual([`adopted ${task.id} ${task.title}`]);
    expect(test.ctx.exitCode).toBe(0);
  });

  it("passes a title through", async () => {
    const test = cli([session(4211, null)]);
    await adoptCommand(test.ctx).parseAsync(["api", "--task", "review the parser"], {
      from: "user",
    });
    expect(test.adopted[0]?.body.title).toBe("review the parser");
  });

  it("says so and exits 1 when nothing is running there", async () => {
    const test = cli([]);
    await adoptCommand(test.ctx).parseAsync(["api"], { from: "user" });
    expect(test.err).toEqual(["agn: no coding agent is running under /work/api"]);
    expect(test.adopted).toEqual([]);
    expect(test.ctx.exitCode).toBe(1);
  });

  it("prints the daemon's answer when the session under the path is already a task", async () => {
    const test = createTestContext({
      cwd: "/work",
      client: {
        listRepos: () => Promise.resolve({ repos: [repo], cursor: 0 }),
        listSessions: () =>
          Promise.reject(
            new DaemonApiError(`task ${task.id} is already running under /work/api/sub`, {
              code: "adopt-already-adopted",
              hint: `Run \`agn status ${task.id}\` to see it.`,
              status: 409,
            }),
          ),
      },
    });

    const code = await runMain(["node", "agn", "adopt", "api"], test.ctx);

    expect(code).toBe(1);
    expect(test.err).toEqual([
      `agn: task ${task.id} is already running under /work/api/sub`,
      `  hint: Run \`agn status ${task.id}\` to see it.`,
    ]);
  });

  it("lists the candidates and asks for --pid when there are several", async () => {
    const test = cli([session(4211, null), session(4300, { socket: "agn", session: "agn-x" })]);
    await adoptCommand(test.ctx).parseAsync(["api"], { from: "user" });
    expect(test.out).toEqual([
      "4211  claude-code  /work/api/sub  not under tmux",
      "4300  claude-code  /work/api/sub  agn-x",
    ]);
    expect(test.err).toEqual(["pass --pid <n> to pick one"]);
    expect(test.adopted).toEqual([]);
    expect(test.ctx.exitCode).toBe(1);
  });

  it("takes the pid the user picked", async () => {
    const test = cli([session(4211, null), session(4300, null)]);
    await adoptCommand(test.ctx).parseAsync(["api", "--pid", "4300"], { from: "user" });
    expect(test.adopted[0]?.body.pid).toBe(4300);
    expect(test.out).toEqual([`adopted ${task.id} ${task.title}`]);
  });

  it("is a usage error when --pid is not a process id", async () => {
    const test = cli([session(4211, null)]);
    const code = await runMain(["node", "agn", "adopt", "api", "--pid", "later"], test.ctx);
    expect(code).toBe(2);
    expect(test.adopted).toEqual([]);
  });

  it("fails when the path belongs to no registered repo", async () => {
    const test = cli([]);
    const code = await runMain(["node", "agn", "adopt", "/elsewhere"], test.ctx);
    expect(code).toBe(1);
    expect(test.err.join("\n")).toContain("/elsewhere is not inside a registered repo");
  });

  it("prints the candidates as JSON when asked, and adopts nothing", async () => {
    const test = cli([session(4211, null), session(4300, null)]);
    test.ctx.json = true;
    await adoptCommand(test.ctx).parseAsync(["api"], { from: "user" });
    expect(JSON.parse(test.out.join("\n")).sessions).toHaveLength(2);
    expect(test.adopted).toEqual([]);
    expect(test.ctx.exitCode).toBe(1);
  });
});
