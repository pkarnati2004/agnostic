import { agnosticPaths, type Outcome, type OutcomeResponse, type Task } from "@agnostic/core";
import type { CommanderError } from "commander";
import { describe, expect, it } from "vitest";
import { createTestContext } from "../test-context.js";
import { outcomesCommand } from "./outcomes.js";

const PATHS = agnosticPaths("/home/.agnostic");

const task: Task = {
  id: "q4m8n2vwxy",
  repoId: "r7k2m4pqrs",
  title: "add a --verbose flag to the CLI",
  prompt: "p",
  profileId: "claude-code:opus:native",
  worktreePath: "/home/.agnostic/worktrees/r7k2m4pqrs/q4m8n2vwxy",
  branch: "agn/verbose-q4m8n2vwxy",
  status: "done",
  origin: "agn",
  baseCommit: "9f1c0de",
  createdAt: "2026-09-11T10:00:00.000Z",
  updatedAt: "2026-09-11T12:00:00.000Z",
};

function outcome(over: Partial<Outcome> = {}): Outcome {
  return {
    taskId: task.id,
    testsBefore: true,
    testsAfter: true,
    accepted: true,
    reverted: false,
    agentLines: 252,
    humanChangedLines: 18,
    humanEditRatio: 0.0714,
    durationSec: 760,
    costUsd: null,
    tokens: 184_210,
    resolvedModel: "claude-opus-4-1",
    ...over,
  };
}

function cli(opts: { body?: OutcomeResponse; cwd?: string } = {}) {
  const asked: string[] = [];
  const test = createTestContext({
    cwd: opts.cwd ?? "/work/api",
    paths: PATHS,
    client: {
      taskOutcome: (id) => {
        asked.push(id);
        return Promise.resolve(opts.body ?? { task, outcome: outcome() });
      },
    },
  });
  return { ...test, asked };
}

function parse(ctx: ReturnType<typeof cli>["ctx"], args: string[]): Promise<unknown> {
  return outcomesCommand(ctx).exitOverride().parseAsync(args, { from: "user" });
}

describe("agn outcomes", () => {
  it("prints one field per line, aligned", async () => {
    const test = cli();

    await parse(test.ctx, [task.id]);

    expect(test.out).toEqual([
      "id:          q4m8n2vwxy",
      "title:       add a --verbose flag to the CLI",
      "status:      done",
      "verdict:     accepted",
      "profile:     claude-code:opus:native",
      "model:       claude-opus-4-1",
      "duration:    12m 40s",
      "tokens:      184,210",
      "cost:        included in plan",
      "tests:       before pass, after pass",
      "agent lines: 252",
      "human lines: 18 (7%)",
    ]);
  });

  it("says not merged for work nobody has taken, and prices a metered run", async () => {
    const test = cli({
      body: {
        task,
        outcome: outcome({ accepted: false, reverted: false, costUsd: 1.234, testsAfter: false }),
      },
    });

    await parse(test.ctx, [task.id]);

    expect(test.out).toContain("verdict:     not merged");
    expect(test.out).toContain("cost:        $1.23");
    expect(test.out).toContain("tests:       before pass, after fail");
  });

  it("dashes every field a folder task has no answer for", async () => {
    const folder = { ...task, worktreePath: null, branch: null, baseCommit: null };
    const test = cli({
      body: {
        task: folder,
        outcome: outcome({
          accepted: null,
          reverted: null,
          agentLines: null,
          humanChangedLines: null,
          humanEditRatio: null,
          testsBefore: null,
          resolvedModel: null,
          durationSec: 45,
        }),
      },
    });

    await parse(test.ctx, [task.id]);

    expect(test.out).toContain("verdict:     -");
    expect(test.out).toContain("model:       -");
    expect(test.out).toContain("duration:    45s");
    expect(test.out).toContain("agent lines: -");
    expect(test.out).toContain("human lines: -");
    expect(test.out).toContain("tests:       before not run, after pass");
  });

  it("says a running task has no outcome yet, without failing", async () => {
    const test = cli({ body: { task: { ...task, status: "running" }, outcome: null } });

    await parse(test.ctx, [task.id]);

    expect(test.out).toEqual(["outcome: not yet (task is running)"]);
    expect(test.ctx.exitCode).toBe(0);
  });

  it("says not yet for a running task whose tests-before row is already stored", async () => {
    const test = cli({
      body: {
        task: { ...task, status: "running" },
        outcome: outcome({
          accepted: null,
          reverted: null,
          agentLines: null,
          humanChangedLines: null,
          humanEditRatio: null,
          testsAfter: null,
          resolvedModel: null,
          durationSec: 0,
          tokens: 0,
        }),
      },
    });

    await parse(test.ctx, [task.id]);

    expect(test.out).toEqual(["outcome: not yet (task is running)"]);
    expect(test.ctx.exitCode).toBe(0);
  });

  it("defaults to the task of the worktree the shell is in", async () => {
    const test = cli({ cwd: `${PATHS.worktrees}/r7k2m4pqrs/q4m8n2vwxy` });

    await parse(test.ctx, []);

    expect(test.asked).toEqual([task.id]);
  });

  it("is a usage error with no task and no worktree", async () => {
    const test = cli();

    await expect(parse(test.ctx, [])).rejects.toThrowError(
      expect.objectContaining({ exitCode: 2 }) as CommanderError,
    );
  });

  it("prints the response as it came when asked for JSON", async () => {
    const body: OutcomeResponse = { task, outcome: outcome() };
    const test = cli({ body });
    test.ctx.json = true;

    await parse(test.ctx, [task.id]);

    expect(JSON.parse(test.out.join("\n"))).toEqual(body);
  });
});
