import { rm } from "node:fs/promises";
import { DaemonApiError, type HandoffTaskRequest, type RunTaskRequest } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toolError } from "./tool.js";
import {
  call,
  context,
  OTHER_REPO,
  REPO,
  type Sandbox,
  sandbox,
  TASK,
  worktree,
} from "./tools-fixture.js";

let box: Sandbox;

beforeEach(async () => {
  box = await sandbox();
});

afterEach(() => rm(box.root, { recursive: true, force: true }));

describe("agn_run", () => {
  it("sends the body to the resolved repo, without the repo argument", async () => {
    const sent: { repoId: string; body: RunTaskRequest }[] = [];
    const { ctx } = context(box, {
      runTask: (repoId, body) => {
        sent.push({ repoId, body });
        return Promise.resolve({ task: TASK });
      },
    });
    const response = await call(ctx, "agn_run", {
      prompt: "add a --verbose flag",
      repo: "r7k",
      skipTests: true,
    });
    expect(sent).toEqual([
      { repoId: "r7k", body: { prompt: "add a --verbose flag", skipTests: true } },
    ]);
    expect(response).toEqual({ task: TASK });
  });

  it("takes the repo from the worktree it runs in", async () => {
    const sent: string[] = [];
    const { ctx } = context(
      box,
      {
        runTask: (repoId) => {
          sent.push(repoId);
          return Promise.resolve({ task: TASK });
        },
      },
      worktree(box),
    );
    await call(ctx, "agn_run", { prompt: "add a flag" });
    expect(sent).toEqual([REPO.id]);
  });

  it("resolves the repo the cwd sits in, outside any worktree, when none is named", async () => {
    const sent: string[] = [];
    const { ctx } = context(
      box,
      {
        listRepos: () => Promise.resolve({ repos: [REPO, OTHER_REPO], cursor: 1 }),
        runTask: (repoId) => {
          sent.push(repoId);
          return Promise.resolve({ task: TASK });
        },
      },
      `${REPO.path}/nested`,
    );
    await call(ctx, "agn_run", { prompt: "add a flag" });
    expect(sent).toEqual([REPO.id]);
  });

  it("refuses when the cwd is outside every registered repo and none is named", async () => {
    const { ctx } = context(
      box,
      { listRepos: () => Promise.resolve({ repos: [REPO, OTHER_REPO], cursor: 1 }) },
      "/nowhere/near/a/repo",
    );
    const cause = await call(ctx, "agn_run", { prompt: "add a flag" }).catch((err: unknown) => err);
    expect(cause).toMatchObject({ code: "repo-not-resolved" });
  });

  it("forwards every field of a full request, and nothing but them, to the resolved repo", async () => {
    const sent: RunTaskRequest[] = [];
    const { ctx } = context(box, {
      runTask: (_repoId, body) => {
        sent.push(body);
        return Promise.resolve({ task: TASK });
      },
    });
    const full = {
      prompt: "add a --verbose flag",
      title: "add --verbose",
      profile: "claude-code",
      model: "opus",
      base: "main",
      intent: "refactor" as const,
      skipTests: true,
      spec: "add a --verbose flag that prints extra lines",
      acceptance: "the flag exists and prints extra lines",
      ignoreBudget: true,
      repo: "r7k",
    };
    await call(ctx, "agn_run", full);
    const { repo: _repo, ...body } = full;
    expect(sent).toEqual([body]);
  });
});

describe("agn_handoff", () => {
  it("hands off the task of the worktree it runs in", async () => {
    const sent: { id: string; profile: string }[] = [];
    const { ctx } = context(
      box,
      {
        handoffTask: (id, body) => {
          sent.push({ id, profile: body.profile });
          return Promise.resolve({ task: TASK, parent: TASK });
        },
      },
      worktree(box),
    );
    await call(ctx, "agn_handoff", { profile: "codex" });
    expect(sent).toEqual([{ id: TASK.id, profile: "codex" }]);
  });

  it("forwards every field of a full request, and nothing but them", async () => {
    const sent: HandoffTaskRequest[] = [];
    const { ctx } = context(
      box,
      {
        handoffTask: (_id, body) => {
          sent.push(body);
          return Promise.resolve({ task: TASK, parent: TASK });
        },
      },
      worktree(box),
    );
    const full = {
      profile: "codex",
      note: "tests pass; the auth flow still needs a look",
      ignoreBudget: true,
      task: "t3n",
    };
    await call(ctx, "agn_handoff", full);
    expect(sent).toEqual([{ profile: "codex", note: full.note, ignoreBudget: true }]);
  });
});

describe("agn_stop", () => {
  it("stops the task it was given", async () => {
    const asked: string[] = [];
    const { ctx } = context(box, {
      stopTask: (id) => {
        asked.push(id);
        return Promise.resolve({ task: { ...TASK, status: "stopped" } });
      },
    });
    await call(ctx, "agn_stop", { task: "t3n" });
    expect(asked).toEqual(["t3n"]);
  });

  it("takes the task from the worktree it runs in when none is named", async () => {
    const asked: string[] = [];
    const { ctx } = context(
      box,
      {
        stopTask: (id) => {
          asked.push(id);
          return Promise.resolve({ task: { ...TASK, status: "stopped" } });
        },
      },
      worktree(box),
    );
    await call(ctx, "agn_stop");
    expect(asked).toEqual([TASK.id]);
  });

  it("says a task is needed when the working directory is not a worktree", async () => {
    const { ctx } = context(box, {});
    const cause = await call(ctx, "agn_stop").catch((err: unknown) => err);
    const result = toolError(cause);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("task-required");
    expect(result.content[0].text).toContain("agn_stop needs a task id");
  });

  it("hands the daemon's own refusal on as an isError result", async () => {
    const { ctx } = context(box, {
      stopTask: () =>
        Promise.reject(
          new DaemonApiError("no task matches nope", {
            code: "task-not-found",
            hint: "Run `agn status --all`.",
            status: 404,
          }),
        ),
    });
    const cause = await call(ctx, "agn_stop", { task: "nope" }).catch((err: unknown) => err);
    expect(toolError(cause).content[0].text).toBe(
      "task-not-found: no task matches nope\nhint: Run `agn status --all`.",
    );
  });
});

describe("agn_resume", () => {
  it("answers with the attach command and attaches nothing", async () => {
    const attach = { kind: "tmux" as const, argv: ["tmux", "attach", "-t", "agn-t3n9v2wxyz"] };
    const { ctx } = context(box, {
      resumeTask: () => Promise.resolve({ task: TASK, via: "native", attach, recreatedFrom: null }),
    });
    // Nothing attaches: the context's spawn throws, and the answer is the argv alone.
    expect(await call(ctx, "agn_resume", { task: "t3n" })).toMatchObject({ attach });
  });
});
