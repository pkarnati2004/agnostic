import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { branchUpstream, changedFiles, worktreeStates } from "./task-changes.js";
import { gitIn } from "./test-task-run.js";
import { createWorkspace } from "./test-workspace.js";

let path = "";
let bare = "";

beforeEach(async () => {
  path = await createWorkspace({});
  bare = await mkdtemp(join(tmpdir(), "agn-remote-"));
  await gitIn(bare, ["init", "-q", "--bare", "-b", "main", "."]);
});

afterEach(async () => {
  await rm(path, { recursive: true, force: true });
  await rm(bare, { recursive: true, force: true });
});

describe("branchUpstream", () => {
  it("answers null for a branch that was never pushed", async () => {
    expect(await branchUpstream(path, "main")).toBeNull();
  });

  it("names the upstream of a branch that was", async () => {
    await gitIn(path, ["remote", "add", "origin", bare]);
    await gitIn(path, ["push", "-q", "--set-upstream", "origin", "main"]);
    expect(await branchUpstream(path, "main")).toBe("origin/main");
  });
});

describe("worktreeStates", () => {
  it("keys the XY code of every pending path, a rename by its new name", async () => {
    await writeFile(join(path, "kept.md"), "one\n");
    await writeFile(join(path, "moved.md"), "two\n");
    await gitIn(path, ["add", "kept.md", "moved.md"]);
    await gitIn(path, ["commit", "-q", "-m", "two more files"]);

    await writeFile(join(path, "README.md"), "# fixture\nedited\n");
    await writeFile(join(path, "fresh.ts"), "export const fresh = 1;\n");
    await gitIn(path, ["add", "fresh.ts"]);
    await writeFile(join(path, "kept.md"), "one, staged\n");
    await gitIn(path, ["add", "kept.md"]);
    await writeFile(join(path, "kept.md"), "one, staged, then edited again\n");
    await writeFile(join(path, "scratch.txt"), "throwaway\n");
    await gitIn(path, ["mv", "moved.md", "read me.md"]);

    expect(Object.fromEntries(await worktreeStates(path))).toEqual({
      "README.md": " M",
      "fresh.ts": "A ",
      "kept.md": "MM",
      "scratch.txt": "??",
      "read me.md": "R ",
    });
  });

  it("answers an empty map for a clean worktree", async () => {
    expect((await worktreeStates(path)).size).toBe(0);
  });

  it("keys a path edited both staged and unstaged once, not twice", async () => {
    await writeFile(join(path, "dual.ts"), "export const a = 1;\n");
    await gitIn(path, ["add", "dual.ts"]);
    await gitIn(path, ["commit", "-q", "-m", "add dual"]);
    await writeFile(join(path, "dual.ts"), "export const a = 2;\n");
    await gitIn(path, ["add", "dual.ts"]);
    await writeFile(join(path, "dual.ts"), "export const a = 3;\n");
    await writeFile(join(path, "solo.md"), "a note\n");

    const states = await worktreeStates(path);
    expect(states.size).toBe(2);
    expect(states.get("dual.ts")).toBe("MM");
  });
});

describe("changedFiles", () => {
  it("parses a -z rename record whose new name has a space in it", async () => {
    const base = (await gitIn(path, ["rev-parse", "HEAD"])).stdout;
    await gitIn(path, ["mv", "README.md", "read me.md"]);
    await gitIn(path, ["commit", "-q", "-m", "rename with a space"]);
    const tip = (await gitIn(path, ["rev-parse", "HEAD"])).stdout;

    expect(await changedFiles(path, base, tip, null)).toEqual([
      {
        path: "read me.md",
        status: "renamed",
        state: "committed",
        additions: 0,
        deletions: 0,
        from: "README.md",
      },
    ]);
  });

  it("reads every row as committed when there is no worktree to read states from", async () => {
    const base = (await gitIn(path, ["rev-parse", "HEAD"])).stdout;
    await writeFile(join(path, "a.ts"), "export const a = 1;\n");
    await gitIn(path, ["add", "a.ts"]);
    await gitIn(path, ["commit", "-q", "-m", "add a"]);
    const tip = (await gitIn(path, ["rev-parse", "HEAD"])).stdout;

    const files = await changedFiles(path, base, tip, null);
    expect(files.map((file) => [file.path, file.state])).toEqual([["a.ts", "committed"]]);
  });

  it("states each row from the worktree and orders them unstaged, staged, committed", async () => {
    const base = (await gitIn(path, ["rev-parse", "HEAD"])).stdout;
    await writeFile(join(path, "a.ts"), "export const a = 1;\n");
    await gitIn(path, ["add", "a.ts"]);
    await gitIn(path, ["commit", "-q", "-m", "add a"]);
    await writeFile(join(path, "README.md"), "# fixture\nedited\n");
    await writeFile(join(path, "staged.ts"), "export const s = 1;\n");
    await gitIn(path, ["add", "staged.ts"]);
    await writeFile(join(path, "note.md"), "a note\n");

    const files = await changedFiles(path, base, "HEAD", await worktreeStates(path));
    expect(files.map((file) => [file.path, file.state])).toEqual([
      ["README.md", "unstaged"],
      ["note.md", "unstaged"],
      ["staged.ts", "staged"],
      ["a.ts", "committed"],
    ]);
  });

  it("reads a path committed and then edited again as one unstaged row", async () => {
    const base = (await gitIn(path, ["rev-parse", "HEAD"])).stdout;
    await writeFile(join(path, "a.ts"), "export const a = 1;\n");
    await gitIn(path, ["add", "a.ts"]);
    await gitIn(path, ["commit", "-q", "-m", "add a"]);
    await writeFile(join(path, "a.ts"), "export const a = 2;\n");

    const files = await changedFiles(path, base, "HEAD", await worktreeStates(path));
    expect(files.map((file) => [file.path, file.state])).toEqual([["a.ts", "unstaged"]]);
  });

  it("states a deletion unstaged when it is only in the working tree", async () => {
    await writeFile(join(path, "gone.txt"), "bye\n");
    await gitIn(path, ["add", "gone.txt"]);
    await gitIn(path, ["commit", "-q", "-m", "add gone"]);
    const base = (await gitIn(path, ["rev-parse", "HEAD"])).stdout;
    await rm(join(path, "gone.txt"));

    const states = await worktreeStates(path);
    expect(states.get("gone.txt")).toBe(" D");
    const files = await changedFiles(path, base, "HEAD", states);
    expect(files.find((file) => file.path === "gone.txt")).toMatchObject({
      status: "deleted",
      state: "unstaged",
    });
  });

  it("states a deletion staged once it is `git rm`ed", async () => {
    await writeFile(join(path, "gone.txt"), "bye\n");
    await gitIn(path, ["add", "gone.txt"]);
    await gitIn(path, ["commit", "-q", "-m", "add gone"]);
    const base = (await gitIn(path, ["rev-parse", "HEAD"])).stdout;
    await gitIn(path, ["rm", "-q", "gone.txt"]);

    const states = await worktreeStates(path);
    expect(states.get("gone.txt")).toBe("D ");
    const files = await changedFiles(path, base, "HEAD", states);
    expect(files.find((file) => file.path === "gone.txt")).toMatchObject({
      status: "deleted",
      state: "staged",
    });
  });
});
