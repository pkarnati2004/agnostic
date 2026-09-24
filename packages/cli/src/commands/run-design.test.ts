import type {
  BudgetReport,
  DesignOpenResponse,
  ProcessOptions,
  spawn,
  Task,
  UsageResponse,
} from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { runMain } from "../program.js";
import { createTestContext } from "../test-context.js";
import { runCommand } from "./run.js";

const REPO = {
  id: "r7k2m4pqrs",
  path: "/work/api",
  kind: "git" as const,
  name: "api",
  addedAt: "2026-09-11T10:00:00.000Z",
  status: "active" as const,
  testCommand: null as string | null,
  pathPresent: true,
};

const NO_BUDGET: BudgetReport = { day: null, week: null };

/** Only the budget is read from this body, and a design run never asks for it. */
function usage(): UsageResponse {
  const window = (kind: "day" | "week") => ({
    kind,
    since: "2026-09-11T00:00:00.000Z",
    until: "2026-09-11T15:00:00.000Z",
  });
  return {
    day: { window: window("day"), plans: [] },
    week: { window: window("week"), plans: [] },
    budget: NO_BUDGET,
    scannedAt: "2026-09-11T15:00:00.000Z",
  };
}

function parse(command: ReturnType<typeof runCommand>, args: string[]): Promise<unknown> {
  return command.parseAsync(args, { from: "user" });
}

const WORKTREE = "/home/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz";

const DESIGN_TASK: Task = {
  id: "t3n9v2wxyz",
  repoId: REPO.id,
  title: "wireframe the onboarding",
  prompt: "wireframe the onboarding",
  profileId: "other:claude-design:default:native",
  worktreePath: WORKTREE,
  branch: "agn/wireframe-the-onboarding-t3n9v2wxyz",
  status: "waiting",
  origin: "agn",
  baseCommit: null,
  compareId: null,
  createdAt: "2026-09-11T10:00:00.000Z",
  updatedAt: "2026-09-11T10:00:00.000Z",
};

const DESIGN_OPEN: DesignOpenResponse = {
  task: DESIGN_TASK,
  tool: {
    id: "claude-design",
    name: "Claude Design",
    via: "url",
    path: "https://claude.ai/design",
  },
  folder: `${DESIGN_TASK.worktreePath}/design`,
  argv: ["open", "https://claude.ai/design"],
};

/** The design run's own context: a client that answers the design open, and a spawn that records. */
function designCli() {
  const spawned: { command: string; args: string[] }[] = [];
  const fakeSpawn = ((command: string, args: string[] = [], _opts: ProcessOptions = {}) => {
    spawned.push({ command, args });
    return Object.assign(Promise.resolve({ exitCode: 0 }), {
      unref: () => undefined,
    }) as unknown as ReturnType<typeof spawn>;
  }) as typeof spawn;
  const test = createTestContext({
    cwd: REPO.path,
    spawn: fakeSpawn,
    client: {
      listRepos: () => Promise.resolve({ repos: [REPO], cursor: 0 }),
      usage: () => Promise.resolve(usage()),
      runTask: () => Promise.resolve({ task: DESIGN_TASK }),
      designOpenInfo: () => Promise.resolve(DESIGN_OPEN),
    },
  });
  return { ...test, spawned };
}

describe("agn run --intent design", () => {
  it("opens the design tool and says where the files go and what finishes the task", async () => {
    const test = designCli();
    await parse(runCommand(test.ctx), ["wireframe the onboarding", "--intent", "design"]);
    expect(test.spawned).toEqual([{ command: "open", args: ["https://claude.ai/design"] }]);
    expect(test.out).toEqual([
      "started t3n9v2wxyz wireframe the onboarding",
      `worktree: ${DESIGN_TASK.worktreePath}`,
      `branch:   ${DESIGN_TASK.branch}`,
      `design folder: ${DESIGN_OPEN.folder}`,
      "opened Claude Design",
      "finish:   agn stop t3n9v2wxyz",
    ]);
  });

  it("says how to open it later with --no-open, and opens nothing", async () => {
    const test = designCli();
    await parse(runCommand(test.ctx), [
      "wireframe the onboarding",
      "--intent",
      "design",
      "--no-open",
    ]);
    expect(test.spawned).toEqual([]);
    expect(test.out.slice(-2)).toEqual([
      "open:     agn open t3n9v2wxyz --tool",
      "finish:   agn stop t3n9v2wxyz",
    ]);
  });

  it("prints the run response and opens nothing under --json", async () => {
    const test = designCli();
    test.ctx.json = true;
    await parse(runCommand(test.ctx), ["wireframe the onboarding", "--intent", "design"]);
    expect(JSON.parse(test.out.join("\n"))).toEqual({ task: DESIGN_TASK });
    expect(test.spawned).toEqual([]);
  });

  it("is a usage error with a profile, a harness or a model, before any request", async () => {
    for (const flag of ["--profile", "--harness", "--model"]) {
      const test = designCli();
      const code = await runMain(
        ["node", "agn", "run", "wireframe it", "--intent", "design", flag, "claude-code"],
        test.ctx,
      );
      expect(code).toBe(2);
      expect(test.err.join("\n")).toContain("design tool");
      expect(test.spawned).toEqual([]);
    }
  });
});
