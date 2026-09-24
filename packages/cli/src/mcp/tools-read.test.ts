import { rm } from "node:fs/promises";
import type { Outcome, RecommendRequest } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findTool } from "./tools.js";
import {
  call,
  context,
  OTHER_REPO,
  REPO,
  type Sandbox,
  sandbox,
  TASK,
  USAGE,
  worktree,
} from "./tools-fixture.js";

let box: Sandbox;

beforeEach(async () => {
  box = await sandbox();
});

afterEach(() => rm(box.root, { recursive: true, force: true }));

describe("agn_status", () => {
  it("lists every repo and every task when no repo is named", async () => {
    const asked: (boolean | undefined)[] = [];
    const { ctx } = context(box, {
      listRepos: (query) => {
        asked.push(query?.all);
        return Promise.resolve({ repos: [REPO, OTHER_REPO], cursor: 1 });
      },
      listAllTasks: () =>
        Promise.resolve({ tasks: [{ ...TASK, worktreePresent: true }], cursor: 1 }),
    });
    expect(await call(ctx, "agn_status")).toEqual({
      repos: [REPO, OTHER_REPO],
      tasks: [{ ...TASK, worktreePresent: true }],
    });
    expect(asked).toEqual([undefined]);
  });

  it("passes the status filter on to the task list", async () => {
    const asked: unknown[] = [];
    const { ctx } = context(box, {
      listRepos: () => Promise.resolve({ repos: [REPO], cursor: 1 }),
      listAllTasks: (query) => {
        asked.push(query);
        return Promise.resolve({ tasks: [], cursor: 1 });
      },
    });
    await call(ctx, "agn_status", { status: ["running", "waiting"] });
    expect(asked).toEqual([{ status: ["running", "waiting"] }]);
  });

  it("narrows to one repo's tasks when a repo prefix is given", async () => {
    const asked: string[] = [];
    const { ctx } = context(box, {
      listRepos: () => Promise.resolve({ repos: [REPO, OTHER_REPO], cursor: 1 }),
      listTasks: (repoId) => {
        asked.push(repoId);
        return Promise.resolve({ tasks: [], cursor: 1 });
      },
    });
    expect(await call(ctx, "agn_status", { repo: "r7k" })).toEqual({ repos: [REPO], tasks: [] });
    expect(asked).toEqual(["r7k"]);
  });

  it("refuses a status no task can be in", () => {
    expect(findTool("agn_status")?.schema.safeParse({ status: ["nope"] }).success).toBe(false);
  });
});

describe("agn_task", () => {
  it("merges the task row, its outcome and its usage", async () => {
    const outcome = { taskId: TASK.id, tokens: 12 } as unknown as Outcome;
    const { ctx } = context(box, {
      getTask: () => Promise.resolve({ task: TASK }),
      taskOutcome: () => Promise.resolve({ task: TASK, outcome }),
      taskUsage: () => Promise.resolve({ task: TASK, usage: USAGE, billing: "subscription" }),
    });
    expect(await call(ctx, "agn_task", { task: "t3n" })).toEqual({
      task: TASK,
      outcome,
      usage: USAGE,
      billing: "subscription",
    });
  });

  it("asks the three endpoints about the task of the worktree it runs in", async () => {
    const asked: string[] = [];
    const record = (id: string) => {
      asked.push(id);
    };
    const { ctx } = context(
      box,
      {
        getTask: (id) => {
          record(id);
          return Promise.resolve({ task: TASK });
        },
        taskOutcome: (id) => {
          record(id);
          return Promise.resolve({ task: TASK, outcome: null });
        },
        taskUsage: (id) => {
          record(id);
          return Promise.resolve({ task: TASK, usage: USAGE, billing: null });
        },
      },
      worktree(box),
    );
    await call(ctx, "agn_task");
    expect(asked).toEqual([TASK.id, TASK.id, TASK.id]);
  });
});

describe("agn_recommend", () => {
  it("sends the resolved repo id and forwards the rest of the request", async () => {
    const sent: RecommendRequest[] = [];
    const { ctx } = context(box, {
      recommend: (body) => {
        sent.push(body);
        return Promise.resolve({ recommendation: { taskClass: {} } as never });
      },
    });
    await call(ctx, "agn_recommend", {
      prompt: "fix the flaky auth test",
      repo: "r7k",
      intent: "debug",
      dryRun: true,
    });
    expect(sent).toEqual([
      { repoId: "r7k", prompt: "fix the flaky auth test", intent: "debug", dryRun: true },
    ]);
  });

  it("resolves the repo the cwd sits in when neither a worktree nor --repo names one", async () => {
    const sent: RecommendRequest[] = [];
    const { ctx } = context(
      box,
      {
        listRepos: () => Promise.resolve({ repos: [REPO, OTHER_REPO], cursor: 1 }),
        recommend: (body) => {
          sent.push(body);
          return Promise.resolve({ recommendation: { taskClass: {} } as never });
        },
      },
      `${REPO.path}/src`,
    );
    await call(ctx, "agn_recommend", { prompt: "fix the flaky auth test" });
    expect(sent).toEqual([{ repoId: REPO.id, prompt: "fix the flaky auth test" }]);
  });

  it("refuses when the cwd is outside every registered repo and none is named", async () => {
    const { ctx } = context(
      box,
      { listRepos: () => Promise.resolve({ repos: [REPO, OTHER_REPO], cursor: 1 }) },
      "/nowhere/near/a/repo",
    );
    const cause = await call(ctx, "agn_recommend", { prompt: "fix it" }).catch(
      (err: unknown) => err,
    );
    expect(cause).toMatchObject({ code: "repo-not-resolved" });
  });
});

describe("agn_usage", () => {
  it("answers with both windows outside a worktree", async () => {
    const { ctx } = context(box, {
      usage: () => Promise.resolve({ scannedAt: "now" } as never),
      taskUsage: () => Promise.reject(new Error("a task's usage was not asked for")),
    });
    expect(await call(ctx, "agn_usage")).toEqual({ scannedAt: "now" });
  });

  it("answers with one task's usage when a task is named", async () => {
    const { ctx } = context(box, {
      taskUsage: (id) => Promise.resolve({ task: { ...TASK, id }, usage: USAGE, billing: null }),
    });
    expect(await call(ctx, "agn_usage", { task: "t3n" })).toMatchObject({ usage: USAGE });
  });
});

describe("agn_profiles", () => {
  it("takes no arguments and answers with the profile list", async () => {
    const { ctx } = context(box, {
      profiles: () => Promise.resolve({ profiles: [], detectedAt: "2026-09-11T10:00:00.000Z" }),
    });
    expect(await call(ctx, "agn_profiles")).toEqual({
      profiles: [],
      detectedAt: "2026-09-11T10:00:00.000Z",
    });
    expect(findTool("agn_profiles")?.schema.safeParse({ task: "t3n" }).success).toBe(false);
  });
});
