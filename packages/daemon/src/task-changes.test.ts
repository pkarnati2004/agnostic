import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { branchUpstream, changedFiles } from "./task-changes.js";
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

describe("changedFiles", () => {
  it("parses a -z rename record whose new name has a space in it", async () => {
    const base = (await gitIn(path, ["rev-parse", "HEAD"])).stdout;
    await gitIn(path, ["mv", "README.md", "read me.md"]);
    await gitIn(path, ["commit", "-q", "-m", "rename with a space"]);
    const tip = (await gitIn(path, ["rev-parse", "HEAD"])).stdout;

    expect(await changedFiles(path, base, tip, false)).toEqual([
      { path: "read me.md", status: "renamed", additions: 0, deletions: 0, from: "README.md" },
    ]);
  });
});
