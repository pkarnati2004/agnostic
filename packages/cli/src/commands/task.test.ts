import type { DeleteTaskResponse } from "@agnostic/core";
import { DaemonApiError } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { runMain } from "../program.js";
import { createTestContext } from "../test-context.js";
import { taskCommand } from "./task.js";

const TASK = "t3n9v2wxyz";

function cli(answer: Partial<DeleteTaskResponse> | DaemonApiError) {
  const asked: string[] = [];
  const test = createTestContext({
    client: {
      deleteTask: (id) => {
        asked.push(id);
        return answer instanceof DaemonApiError
          ? Promise.reject(answer)
          : Promise.resolve({
              deleted: true,
              taskId: id,
              branch: "agn/flag",
              removedWorktree: true,
              ...answer,
            });
      },
    },
  });
  return { ...test, asked };
}

describe("agn task delete", () => {
  it("reports the worktree it removed and the branch it kept", async () => {
    const test = cli({});
    await taskCommand(test.ctx).parseAsync(["delete", TASK], { from: "user" });
    expect(test.asked).toEqual([TASK]);
    expect(test.out).toEqual([`deleted ${TASK}: worktree removed, branch agn/flag kept`]);
  });

  it("says there was no worktree when the task was already cleaned", async () => {
    const test = cli({ removedWorktree: false });
    await taskCommand(test.ctx).parseAsync(["delete", TASK], { from: "user" });
    expect(test.out).toEqual([`deleted ${TASK}: no worktree to remove, branch agn/flag kept`]);
  });

  it("leaves the branch out for a task that never had one", async () => {
    const test = cli({ removedWorktree: false, branch: null });
    await taskCommand(test.ctx).parseAsync(["delete", TASK], { from: "user" });
    expect(test.out).toEqual([`deleted ${TASK}: no worktree to remove`]);
  });

  it("prints the daemon's body with --json", async () => {
    const test = cli({});
    test.ctx.json = true;
    await taskCommand(test.ctx).parseAsync(["delete", TASK], { from: "user" });
    expect(JSON.parse(test.out.join("\n"))).toEqual({
      deleted: true,
      taskId: TASK,
      branch: "agn/flag",
      removedWorktree: true,
    });
  });

  it("renders a refusal with its hint, and exits 1", async () => {
    const test = cli(
      new DaemonApiError(`task ${TASK} is still running`, {
        code: "task-active",
        status: 409,
        hint: `Run \`agn stop ${TASK}\` first.`,
      }),
    );
    const code = await runMain(["node", "agn", "task", "delete", TASK], test.ctx);
    expect(code).toBe(1);
    expect(test.err).toEqual([
      `agn: task ${TASK} is still running`,
      `  hint: Run \`agn stop ${TASK}\` first.`,
    ]);
    expect(test.out).toEqual([]);
  });

  it("prints task-not-found for an id no task has, and exits 1", async () => {
    const test = cli(
      new DaemonApiError(`no task with id "${TASK}"`, { code: "task-not-found", status: 404 }),
    );
    const code = await runMain(["node", "agn", "task", "delete", TASK], test.ctx);
    expect(code).toBe(1);
    expect(test.err).toEqual([`agn: no task with id "${TASK}"`]);
    expect(test.out).toEqual([]);
  });
});
