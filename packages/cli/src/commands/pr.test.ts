import { rm } from "node:fs/promises";
import {
  agnosticPaths,
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

async function cli(over: Partial<CreatePrResponse> = {}, tools: string[] = []) {
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
  const test = createTestContext({
    paths: PATHS,
    env: { PATH: shims.dir },
    spawn: fakeSpawn,
    client: {
      createPr: (_id: string, body: CreatePrRequest) => {
        asked.push(body);
        return Promise.resolve(response(over));
      },
    },
  });
  return { ...test, spawned, asked, shims };
}

async function runPr(test: { ctx: ReturnType<typeof createTestContext>["ctx"] }, argv: string[]) {
  await prCommand(test.ctx, "darwin").parseAsync(argv, { from: "user" });
}

describe("agn pr", () => {
  it("says what was pushed, where the PR is, and opens it", async () => {
    const test = await cli({}, ["pbcopy"]);
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
    const test = await cli({ via: "compare", url: compare, pushed: false }, ["pbcopy"]);
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
    const test = await cli({}, ["pbcopy"]);
    await runPr(test, ["t3n9v2wxyz", "--no-open"]);
    expect(test.spawned).toEqual([]);
    expect(await test.shims.received("pbcopy")).toBe(BODY);
    expect(test.out).toEqual([
      `pushed ${BRANCH} to origin`,
      "pr: https://github.com/agn/petal/pull/12",
      "body copied to the clipboard",
    ]);
  });

  it("prints the response and opens nothing with --json", async () => {
    const test = await cli();
    test.ctx.json = true;
    await runPr(test, ["t3n9v2wxyz"]);
    expect(JSON.parse(test.out.join("\n"))).toEqual(response());
    expect(test.spawned).toEqual([]);
  });
});
