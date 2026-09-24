import type { ChangesResponse, DaemonClient, Task } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { createTestContext } from "../test-context.js";
import { changesCommand } from "./changes.js";

const TASK = { id: "abcdefghjk", branch: "agn/invite-links-a1b2" } as Task;

function response(over: Partial<ChangesResponse> = {}): ChangesResponse {
  return {
    task: TASK,
    base: { ref: "main", commit: "c0ffee" },
    ahead: 3,
    behind: 4,
    uncommitted: 2,
    pushed: false,
    remote: null,
    files: [
      { path: "src/invite.ts", status: "modified", additions: 42, deletions: 3 },
      { path: "src/invite.test.ts", status: "added", additions: 80, deletions: 0 },
      { path: "docs/invites.md", status: "untracked", additions: 4, deletions: 0 },
      { path: "logo.png", status: "added", additions: null, deletions: null },
    ],
    ...over,
  };
}

function cli(client: Partial<DaemonClient>) {
  return createTestContext({ client, cwd: "/work" });
}

async function runChanges(
  client: Partial<DaemonClient>,
  argv: string[],
): Promise<{ out: string[]; err: string[] }> {
  const test = cli(client);
  await changesCommand(test.ctx).parseAsync(argv, { from: "user" });
  return { out: test.out, err: test.err };
}

describe("agn changes", () => {
  it("prints the header line and one row per file", async () => {
    const { out } = await runChanges({ taskChanges: () => Promise.resolve(response()) }, [
      "abcdefghjk",
    ]);
    expect(out[0]).toBe(
      "agn/invite-links-a1b2 -> main  3 commits, 2 uncommitted, behind 4  not pushed",
    );
    expect(out[1]).toBe("src/invite.ts       M  +42 -3");
    expect(out[2]).toBe("src/invite.test.ts  A  +80 -0");
    expect(out[3]).toBe("docs/invites.md     ?  untracked");
    expect(out[4]).toBe("logo.png            A  binary");
  });

  it("says when a pushed branch is level with its base", async () => {
    const { out } = await runChanges(
      {
        taskChanges: () =>
          Promise.resolve(response({ ahead: 1, behind: 0, uncommitted: 0, pushed: true })),
      },
      ["abcdefghjk"],
    );
    expect(out[0]).toBe("agn/invite-links-a1b2 -> main  1 commit, 0 uncommitted  pushed");
  });

  it("prints nothing but the reason when the branch has no changes", async () => {
    const { out } = await runChanges(
      { taskChanges: () => Promise.resolve(response({ files: [] })) },
      ["abcdefghjk"],
    );
    expect(out).toEqual(["no changes against main yet"]);
  });

  it("prints one file's patch verbatim", async () => {
    const asked: string[] = [];
    const { out } = await runChanges(
      {
        taskDiff: (id, path) => {
          asked.push(`${id} ${path}`);
          return Promise.resolve({ patch: "@@ -1 +1 @@\n-old\n+new" });
        },
      },
      ["abcdefghjk", "--patch", "src/invite.ts"],
    );
    expect(asked).toEqual(["abcdefghjk src/invite.ts"]);
    expect(out).toEqual(["@@ -1 +1 @@", "-old", "+new"]);
  });

  it("prints the daemon's own body with --json", async () => {
    const test = cli({ taskChanges: () => Promise.resolve(response()) });
    test.ctx.json = true;
    await changesCommand(test.ctx).parseAsync(["abcdefghjk"], { from: "user" });
    expect(JSON.parse(test.out.join("\n"))).toEqual(response());
  });

  it("exits 2 when it is given no task and is not in a worktree", async () => {
    const test = cli({});
    const command = changesCommand(test.ctx).exitOverride();
    await expect(command.parseAsync([], { from: "user" })).rejects.toMatchObject({ exitCode: 2 });
  });
});
