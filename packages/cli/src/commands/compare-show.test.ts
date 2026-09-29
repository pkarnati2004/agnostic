import { DaemonApiError } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { runMain } from "../program.js";
import { createTestContext } from "../test-context.js";
import { cli, NO_USAGE, NOW, outcome, row, run } from "./compare-fixture.js";

describe("agn compare show", () => {
  it("prints the header and one row per agent", async () => {
    const test = cli({
      compare: {
        tasks: [
          row(),
          row({
            id: "t2",
            profileId: "codex:gpt-5-codex:native",
            status: "stopped",
            changes: null,
            billing: "subscription",
            outcome: outcome({ taskId: "t2", testsAfter: false, durationSec: 243 }),
          }),
        ],
      },
    });
    await run(test, ["show", "cmp1"]);
    expect(test.out[0]).toBe("compare cmp1  Add the retry budget  (2 agents)");
    expect(test.out[1]?.split(/ {2,}/)).toEqual([
      "task",
      "profile",
      "status",
      "files",
      "+/-",
      "tests",
      "cost",
      "time",
    ]);
    expect(test.out[2]?.split(/ {2,}/).slice(0, 7)).toEqual([
      "t1",
      "claude-code:sonnet-4.5:native",
      "running",
      "3",
      "+42 -7",
      "-",
      "-",
    ]);
    expect(test.out[3]?.split(/ {2,}/)).toEqual([
      "t2",
      "codex:gpt-5-codex:native",
      "stopped",
      "-",
      "-",
      "fail",
      "in plan",
      "4m 3s",
    ]);
  });

  it("prices a row the ledger has a cost for", async () => {
    const test = cli({ compare: { tasks: [row({ usage: { ...NO_USAGE, costUsd: 0.12 } })] } });
    await run(test, ["show", "cmp1"]);
    expect(test.out[2]).toContain("$0.12");
  });

  it("counts a live row from when it started", async () => {
    const started = new Date(NOW - 65_000).toISOString();
    const test = cli({ compare: { tasks: [row({ createdAt: started })] } });
    await run(test, ["show", "cmp1"]);
    // The clock moves between the fixture and the render, so only the shape is pinned.
    expect(test.out[2]).toMatch(/\d+m \d+s$/);
  });

  it("names the picked sibling under the table", async () => {
    const test = cli({ compare: { tasks: [row()], pickedTaskId: "t1" } });
    await run(test, ["show", "cmp1"]);
    expect(test.out.at(-1)).toBe("picked: t1 (claude-code:sonnet-4.5:native)");
  });

  it("prints the response as JSON", async () => {
    const test = cli();
    test.ctx.json = true;
    await run(test, ["show", "cmp1"]);
    expect(JSON.parse(test.out.join("\n"))).toMatchObject({ pickedTaskId: null });
  });

  it("is a usage error with no id", async () => {
    const test = cli();
    await expect(run(test, ["show"])).rejects.toMatchObject({
      code: "commander.missingArgument",
    });
  });
});

describe("agn compare pick", () => {
  it("prints what was kept and what was cleaned", async () => {
    const test = cli();
    await run(test, ["pick", "cmp1", "t1"]);
    expect(test.calls.picked).toEqual([{ id: "cmp1", body: { taskId: "t1" } }]);
    expect(test.out).toEqual([
      "kept t1 (claude-code:sonnet-4.5:native)",
      "cleaned t2 (codex:gpt-5-codex:native): stopped, worktree removed, branch agn/retry-budget-a1b2 kept",
    ]);
  });

  it("prints the response as JSON", async () => {
    const test = cli();
    test.ctx.json = true;
    await run(test, ["pick", "cmp1", "t1"]);
    expect(JSON.parse(test.out.join("\n"))).toMatchObject({ compareId: "cmp1" });
  });

  it("is a usage error with no task", async () => {
    const test = cli();
    await expect(run(test, ["pick", "cmp1"])).rejects.toMatchObject({
      code: "commander.missingArgument",
    });
  });

  it("prints the daemon's 404 for a compare id that matches nothing", async () => {
    const test = createTestContext({
      client: {
        pickCompare: () =>
          Promise.reject(
            new DaemonApiError('no compare matches "cmp9"', {
              code: "compare-not-found",
              status: 404,
              hint: "Run `agn compare show <id>`.",
            }),
          ),
      },
    });
    const code = await runMain(["node", "agn", "compare", "pick", "cmp9", "t1"], test.ctx);
    expect(code).toBe(1);
    expect(test.err).toEqual([
      'agn: no compare matches "cmp9"',
      "  hint: Run `agn compare show <id>`.",
    ]);
  });
});
