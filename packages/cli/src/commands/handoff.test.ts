import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agnosticPaths, type HandoffTaskRequest, type Task } from "@agnostic/core";
import { afterEach, describe, expect, it } from "vitest";
import { runMain } from "../program.js";
import { createTestContext } from "../test-context.js";
import { handoffCommand } from "./handoff.js";

const PATHS = agnosticPaths("/home/.agnostic");
const PARENT = "t3n9v2wxyz";
const CHILD = "q4m8n2vwxy";

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    repoId: "r7k2m4pqrs",
    title: "write the parser",
    prompt: "write the parser",
    profileId: "claude-code:default:native",
    worktreePath: `/home/.agnostic/worktrees/r7k2m4pqrs/${id}`,
    branch: `agn/parser-${id}`,
    status: "running",
    origin: "agn",
    createdAt: "2026-09-12T10:00:00.000Z",
    updatedAt: "2026-09-12T10:00:00.000Z",
    ...over,
  };
}

function cli(opts: { cwd?: string; stdin?: string[] } = {}) {
  const sent: { id: string; body: HandoffTaskRequest }[] = [];
  const test = createTestContext({
    cwd: opts.cwd ?? "/work/api",
    paths: PATHS,
    ...(opts.stdin === undefined ? {} : { stdin: opts.stdin }),
    client: {
      handoffTask: (id, body) => {
        sent.push({ id, body });
        return Promise.resolve({
          task: task(CHILD, { profileId: "codex:default:native", parentTaskId: id }),
          parent: task(PARENT, { status: "stopped" }),
        });
      },
    },
  });
  return { ...test, sent };
}

function parse(ctx: ReturnType<typeof cli>["ctx"], args: string[]): Promise<unknown> {
  return handoffCommand(ctx).parseAsync(args, { from: "user" });
}

const dirs: string[] = [];

afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("agn handoff", () => {
  it("names both tasks and then prints where the new one is running", async () => {
    const test = cli();
    await parse(test.ctx, [PARENT, "--to", "codex", "--note", "the printer is next"]);
    expect(test.sent).toEqual([
      { id: PARENT, body: { profile: "codex", note: "the printer is next" } },
    ]);
    expect(test.out).toEqual([
      `handed off ${PARENT} to ${CHILD} (codex:default:native)`,
      `started ${CHILD} write the parser`,
      `worktree: /home/.agnostic/worktrees/r7k2m4pqrs/${CHILD}`,
      `branch:   agn/parser-${CHILD}`,
      `attach:   agn attach ${CHILD}`,
    ]);
  });

  it("takes the task from the worktree it is run in", async () => {
    const test = cli({ cwd: `/home/.agnostic/worktrees/r7k2m4pqrs/${PARENT}` });
    await parse(test.ctx, ["--to", "codex:default:native"]);
    expect(test.sent[0]).toEqual({ id: PARENT, body: { profile: "codex:default:native" } });
  });

  it("reads the note from stdin when it is `-`", async () => {
    const test = cli({ stdin: ["## Decisions", "yaml, not json"] });
    await parse(test.ctx, [PARENT, "--to", "codex", "--note", "-"]);
    expect(test.sent[0]?.body.note).toBe("## Decisions\nyaml, not json");
  });

  it("reads the note from a file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agn-note-"));
    dirs.push(dir);
    await writeFile(join(dir, "note.md"), "the parser is done\n");
    const test = cli({ cwd: dir });
    await parse(test.ctx, [PARENT, "--to", "codex", "--note-file", "note.md"]);
    expect(test.sent[0]?.body.note).toBe("the parser is done");
  });

  it("says so when the note file is not there", async () => {
    const test = cli();
    const code = await runMain(
      ["node", "agn", "handoff", PARENT, "--to", "codex", "--note-file", "missing.md"],
      test.ctx,
    );
    expect(code).toBe(1);
    expect(test.err.join("\n")).toContain("could not be read");
  });

  it("refuses a note that is empty once trimmed", async () => {
    const test = cli();
    const code = await runMain(
      ["node", "agn", "handoff", PARENT, "--to", "codex", "--note", "   "],
      test.ctx,
    );
    expect(code).toBe(1);
    expect(test.err.join("\n")).toContain("empty");
    expect(test.sent).toEqual([]);
  });

  it("refuses --note and --note-file together", async () => {
    const test = cli();
    const code = await runMain(
      ["node", "agn", "handoff", PARENT, "--to", "codex", "--note", "x", "--note-file", "n.md"],
      test.ctx,
    );
    expect(code).toBe(2);
    expect(test.err.join("\n")).toContain("not both");
    expect(test.sent).toEqual([]);
  });

  it("exits 2 without --to", async () => {
    const test = cli();
    const code = await runMain(["node", "agn", "handoff", PARENT], test.ctx);
    expect(code).toBe(2);
    expect(test.err.join("\n")).toContain("--to");
    expect(test.sent).toEqual([]);
  });

  it("prints the daemon's body with --json", async () => {
    const test = cli();
    test.ctx.json = true;
    await parse(test.ctx, [PARENT, "--to", "codex"]);
    const printed = JSON.parse(test.out.join("\n")) as { task: Task; parent: Task };
    expect(printed.task.id).toBe(CHILD);
    expect(printed.parent.status).toBe("stopped");
  });
});
