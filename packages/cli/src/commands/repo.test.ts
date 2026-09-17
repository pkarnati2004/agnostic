import {
  DaemonApiError,
  type RemoveRepoResponse,
  type Repo,
  type RepoResponse,
} from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { runMain } from "../program.js";
import { createTestContext } from "../test-context.js";
import { repoCommand } from "./repo.js";

const REPO: Repo = {
  id: "r1a2b3c4d5",
  path: "/work/api",
  kind: "git",
  name: "api",
  addedAt: "2026-09-11T10:00:00.000Z",
  status: "active",
};

function cli(fail?: DaemonApiError) {
  const asked: string[] = [];
  const answer = (verb: "close" | "open", id: string): Promise<RepoResponse> => {
    asked.push(`${verb} ${id}`);
    const status = verb === "close" ? "archived" : "active";
    return fail === undefined
      ? Promise.resolve({ repo: { ...REPO, status } })
      : Promise.reject(fail);
  };
  const test = createTestContext({
    cwd: "/work",
    client: {
      closeRepo: (id) => answer("close", id),
      openRepo: (id) => answer("open", id),
      listRepos: () =>
        Promise.resolve({ repos: [{ ...REPO, testCommand: null, pathPresent: true }], cursor: 0 }),
    },
  });
  return { ...test, asked };
}

function run(test: ReturnType<typeof cli>, argv: string[]): Promise<unknown> {
  return repoCommand(test.ctx).parseAsync(argv, { from: "user" });
}

describe("agn repo", () => {
  it("closes a repo by id and says so in one line", async () => {
    const test = cli();
    await run(test, ["close", "r1a2b3c4d5"]);
    expect(test.asked).toEqual(["close r1a2b3c4d5"]);
    expect(test.out).toEqual(["closed api r1a2b3c4d5"]);
  });

  it("opens one again", async () => {
    const test = cli();
    await run(test, ["open", "r1a2b3c4d5"]);
    expect(test.out).toEqual(["opened api r1a2b3c4d5"]);
  });

  it("takes a path where it takes an id", async () => {
    const test = cli();
    await run(test, ["close", "./api"]);
    expect(test.asked).toEqual(["close r1a2b3c4d5"]);
  });

  it("opens a closed repo the user names by its path", async () => {
    const asked: string[] = [];
    const test = createTestContext({
      cwd: "/work",
      client: {
        listRepos: (query) => {
          asked.push(`list ${query?.all === true ? "all" : "open"}`);
          const closed = {
            ...REPO,
            status: "archived" as const,
            testCommand: null,
            pathPresent: true,
          };
          return Promise.resolve({ repos: [closed], cursor: 0 });
        },
        openRepo: (id) => {
          asked.push(`open ${id}`);
          return Promise.resolve({ repo: REPO });
        },
      },
    });
    await repoCommand(test.ctx).parseAsync(["open", "/work/api"], { from: "user" });
    expect(asked).toEqual(["list all", "open r1a2b3c4d5"]);
    expect(test.out).toEqual(["opened api r1a2b3c4d5"]);
  });

  it("prints the daemon's body with --json", async () => {
    const test = cli();
    test.ctx.json = true;
    await run(test, ["close", "r1a2b3c4d5"]);
    expect(JSON.parse(test.out.join("\n"))).toEqual({ repo: { ...REPO, status: "archived" } });
  });

  it("renders a refusal with its hint, and exits 1", async () => {
    const test = cli(
      new DaemonApiError("repo api has a task that is still running", {
        code: "repo-busy",
        status: 409,
        hint: "Run `agn stop t3n9v2wxyz` first.",
      }),
    );
    const code = await runMain(["node", "agn", "repo", "close", "r1a2b3c4d5"], test.ctx);
    expect(code).toBe(1);
    expect(test.err).toEqual([
      "agn: repo api has a task that is still running",
      "  hint: Run `agn stop t3n9v2wxyz` first.",
    ]);
    expect(test.out).toEqual([]);
  });

  it("prints the daemon's message for a repo that does not exist, and exits 1", async () => {
    const test = cli(
      new DaemonApiError("no repo with id r1a2b3c4d5", {
        code: "repo-not-found",
        status: 404,
        hint: "Run `agn repos` to see the repos agn knows about.",
      }),
    );
    const code = await runMain(["node", "agn", "repo", "open", "r1a2b3c4d5"], test.ctx);
    expect(code).toBe(1);
    expect(test.err).toEqual([
      "agn: no repo with id r1a2b3c4d5",
      "  hint: Run `agn repos` to see the repos agn knows about.",
    ]);
    expect(test.out).toEqual([]);
  });
});

function cliRemove(worktreesRemoved: number, fail?: DaemonApiError) {
  const asked: string[] = [];
  const test = createTestContext({
    cwd: "/work",
    client: {
      removeRepo: (id) => {
        asked.push(`remove ${id}`);
        const body: RemoveRepoResponse = { repo: { ...REPO, status: "removed" }, worktreesRemoved };
        return fail === undefined ? Promise.resolve(body) : Promise.reject(fail);
      },
    },
  });
  return { ...test, asked };
}

describe("agn repo remove", () => {
  it("hides the repo and reports how many task worktrees were deleted", async () => {
    const test = cliRemove(2);
    await run(test, ["remove", "r1a2b3c4d5"]);
    expect(test.asked).toEqual(["remove r1a2b3c4d5"]);
    expect(test.out).toEqual(["removed api r1a2b3c4d5, worktrees of 2 tasks deleted"]);
  });

  it("says one task, singular", async () => {
    const test = cliRemove(1);
    await run(test, ["remove", "r1a2b3c4d5"]);
    expect(test.out).toEqual(["removed api r1a2b3c4d5, worktrees of 1 task deleted"]);
  });

  it("says there were no worktrees to delete", async () => {
    const test = cliRemove(0);
    await run(test, ["remove", "r1a2b3c4d5"]);
    expect(test.out).toEqual(["removed api r1a2b3c4d5, no worktrees to delete"]);
  });

  it("prints the daemon's body with --json", async () => {
    const test = cliRemove(2);
    test.ctx.json = true;
    await run(test, ["remove", "r1a2b3c4d5"]);
    expect(JSON.parse(test.out.join("\n"))).toEqual({
      repo: { ...REPO, status: "removed" },
      worktreesRemoved: 2,
    });
  });

  it("renders a busy refusal with its hint, and exits 1", async () => {
    const test = cliRemove(
      0,
      new DaemonApiError("repo api has a task that is still running", {
        code: "repo-busy",
        status: 409,
        hint: "Run `agn stop t3n9v2wxyz` first.",
      }),
    );
    const code = await runMain(["node", "agn", "repo", "remove", "r1a2b3c4d5"], test.ctx);
    expect(code).toBe(1);
    expect(test.err).toEqual([
      "agn: repo api has a task that is still running",
      "  hint: Run `agn stop t3n9v2wxyz` first.",
    ]);
    expect(test.out).toEqual([]);
  });
});
