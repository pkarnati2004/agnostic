import type { Task } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { runMain } from "../program.js";
import { createTestContext } from "../test-context.js";
import { stopCommand } from "./stop.js";

const stopped: Task = {
  id: "t3n9v2wxyz",
  repoId: "r7k2m4pqrs",
  title: "add a --verbose flag",
  prompt: "p",
  profileId: "claude-code:default:native",
  worktreePath: "/w/one",
  branch: "agn/flag",
  status: "stopped",
  origin: "agn",
  createdAt: "2026-09-11T10:00:00.000Z",
  updatedAt: "2026-09-11T10:00:00.000Z",
};

function cli() {
  const asked: string[] = [];
  const test = createTestContext({
    client: {
      stopTask: (id) => {
        asked.push(id);
        return Promise.resolve({ task: stopped });
      },
    },
  });
  return { ...test, asked };
}

describe("agn stop", () => {
  it("stops the task it was given", async () => {
    const test = cli();
    await stopCommand(test.ctx).parseAsync(["t3n"], { from: "user" });
    expect(test.asked).toEqual(["t3n"]);
    expect(test.out).toEqual(["stopped t3n9v2wxyz"]);
  });

  it("is a usage error with no task and no worktree", async () => {
    const test = cli();
    expect(await runMain(["node", "agn", "stop"], test.ctx)).toBe(2);
    expect(test.asked).toEqual([]);
  });

  it("prints the response body verbatim with --json", async () => {
    const test = cli();
    test.ctx.json = true;
    await stopCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
    expect(JSON.parse(test.out.join("\n"))).toEqual({ task: stopped });
  });
});
