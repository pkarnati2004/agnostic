import { rm } from "node:fs/promises";
import {
  agnosticPaths,
  type ChangesResponse,
  type CreatePrRequest,
  type CreatePrResponse,
  type ProcessOptions,
  type spawn,
  type Task,
} from "@agnostic/core";
import { afterEach, describe, expect, it } from "vitest";
import { installCopyShims } from "../test-clipboard.js";
import { createTestContext } from "../test-context.js";
import { prCommand } from "./pr.js";

const PATHS = agnosticPaths("/home/.agnostic");
const BRANCH = "agn/invite-links-a1b2";
const BODY = "## Spec\n\nAdd the invite links.\n\n---\nagn task t3n9v2wxyz";

const task = { id: "t3n9v2wxyz", title: "Add the invite links" } as Task;

function response(over: Partial<CreatePrResponse> = {}): CreatePrResponse {
  return {
    task,
    url: "https://github.com/agn/petal/pull/12",
    body: BODY,
    via: "gh",
    pushed: true,
    base: "main",
    branch: BRANCH,
    ...over,
  };
}

const dirs: string[] = [];

afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

type Spawned = { command: string; args: string[]; opts: ProcessOptions };

/** What the panel's header reads; `agn pr` looks at `uncommitted` alone. */
function changes(uncommitted: number): ChangesResponse {
  return {
    task,
    base: { ref: "main", commit: "c0ffee" },
    ahead: 1,
    behind: 0,
    uncommitted,
    pushed: false,
    remote: "git@github.com:agn/petal.git",
    files: [],
  };
}

type PrOpts = { tools?: string[]; uncommitted?: number; changesFail?: boolean };

async function cli(over: Partial<CreatePrResponse> = {}, opts: PrOpts = {}) {
  const tools = opts.tools ?? [];
  const shims = await installCopyShims(tools);
  dirs.push(shims.dir);
  const spawned: Spawned[] = [];
  const asked: CreatePrRequest[] = [];
  const fakeSpawn = ((command: string, args: string[] = [], opts: ProcessOptions = {}) => {
    spawned.push({ command, args, opts });
    return Object.assign(Promise.resolve({ exitCode: 0 }), {
      unref: () => undefined,
    }) as unknown as ReturnType<typeof spawn>;
  }) as typeof spawn;
  const order: string[] = [];
  const test = createTestContext({
    paths: PATHS,
    env: { PATH: shims.dir },
    spawn: fakeSpawn,
    client: {
      taskChanges: () => {
        order.push("changes");
        return opts.changesFail === true
          ? Promise.reject(new Error("the worktree is gone"))
          : Promise.resolve(changes(opts.uncommitted ?? 0));
      },
      createPr: (_id: string, body: CreatePrRequest) => {
        order.push("pr");
        asked.push(body);
        return Promise.resolve(response(over));
      },
    },
  });
  return { ...test, spawned, asked, shims, order };
}

async function runPr(test: { ctx: ReturnType<typeof createTestContext>["ctx"] }, argv: string[]) {
  await prCommand(test.ctx, "darwin").parseAsync(argv, { from: "user" });
}

describe("agn pr", () => {
  it("says what was pushed, where the PR is, and opens it", async () => {
    const test = await cli({}, { tools: ["pbcopy"] });
    await runPr(test, ["t3n9v2wxyz"]);
    expect(test.out).toEqual([
      `pushed ${BRANCH} to origin`,
      "pr: https://github.com/agn/petal/pull/12",
      "body copied to the clipboard",
    ]);
    expect(await test.shims.received("pbcopy")).toBe(BODY);
    expect(test.spawned[0]?.command).toBe("open");
    expect(test.spawned[0]?.args).toEqual(["https://github.com/agn/petal/pull/12"]);
    expect(test.spawned[0]?.opts.logFile).toBe("/home/.agnostic/logs/agn-pr.log");
  });

  it("names the compare page, and says the PR is made on it", async () => {
    const compare = "https://github.com/agn/petal/compare/main...agn%2Fx?expand=1";
    const test = await cli(
      { via: "compare", url: compare, pushed: false },
      {
        tools: ["pbcopy"],
      },
    );
    await runPr(test, ["t3n9v2wxyz"]);
    expect(test.out).toEqual([
      `${BRANCH} already on origin`,
      `compare: ${compare}`,
      "no usable gh (not installed or not logged in): the PR is created on the page that opens",
      "body copied to the clipboard",
    ]);
  });

  it("prints the description when this machine has no clipboard tool", async () => {
    const test = await cli();
    await runPr(test, ["t3n9v2wxyz"]);
    expect(test.out.slice(2)).toEqual(["--- body ---", ...BODY.split("\n")]);
  });

  it("sends the title the user asked for, and none when they did not", async () => {
    const test = await cli();
    await runPr(test, ["t3n9v2wxyz", "--title", "Ship it"]);
    await runPr(test, ["t3n9v2wxyz"]);
    expect(test.asked).toEqual([{ title: "Ship it" }, {}]);
  });

  it("opens nothing with --no-open", async () => {
    const test = await cli();
    await runPr(test, ["t3n9v2wxyz", "--no-open"]);
    expect(test.spawned).toEqual([]);
    expect(test.out[1]).toBe("pr: https://github.com/agn/petal/pull/12");
  });

  it("prints the URL and the body with --no-open when this machine has no clipboard tool", async () => {
    const test = await cli();
    await runPr(test, ["t3n9v2wxyz", "--no-open"]);
    expect(test.spawned).toEqual([]);
    expect(test.out).toEqual([
      `pushed ${BRANCH} to origin`,
      "pr: https://github.com/agn/petal/pull/12",
      "--- body ---",
      ...BODY.split("\n"),
    ]);
  });

  it("opens nothing with --no-open even when pbcopy is on this machine", async () => {
    const test = await cli({}, { tools: ["pbcopy"] });
    await runPr(test, ["t3n9v2wxyz", "--no-open"]);
    expect(test.spawned).toEqual([]);
    expect(await test.shims.received("pbcopy")).toBe(BODY);
    expect(test.out).toEqual([
      `pushed ${BRANCH} to origin`,
      "pr: https://github.com/agn/petal/pull/12",
      "body copied to the clipboard",
    ]);
  });

  it("says how much work stays behind, on stderr, before it pushes", async () => {
    const test = await cli({}, { uncommitted: 2 });
    await runPr(test, ["t3n9v2wxyz", "--no-open"]);
    expect(test.err).toEqual([
      "agn: 2 uncommitted changes stay in the worktree; only commits are pushed",
    ]);
    expect(test.order).toEqual(["changes", "pr"]);
  });

  it("says nothing when the worktree is clean, or when the read failed", async () => {
    const clean = await cli();
    await runPr(clean, ["t3n9v2wxyz", "--no-open"]);
    expect(clean.err).toEqual([]);
    const failed = await cli({}, { changesFail: true });
    await runPr(failed, ["t3n9v2wxyz", "--no-open"]);
    expect(failed.err).toEqual([]);
    expect(failed.out[0]).toBe(`pushed ${BRANCH} to origin`);
  });

  it("reads nothing before the push with --json", async () => {
    const test = await cli({}, { uncommitted: 2 });
    test.ctx.json = true;
    await runPr(test, ["t3n9v2wxyz"]);
    expect(test.err).toEqual([]);
    expect(test.order).toEqual(["pr"]);
  });

  it("prints the response and opens nothing with --json", async () => {
    const test = await cli();
    test.ctx.json = true;
    await runPr(test, ["t3n9v2wxyz"]);
    expect(JSON.parse(test.out.join("\n"))).toEqual(response());
    expect(test.spawned).toEqual([]);
  });
});
