import { rm } from "node:fs/promises";
import { defaultRepoConfig, newId } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { refCommit, repoBaseRef } from "./base-ref.js";
import { gitIn } from "./test-task-run.js";
import { createWorkspace } from "./test-workspace.js";

let path = "";

beforeEach(async () => {
  path = await createWorkspace({});
});

afterEach(async () => {
  await rm(path, { recursive: true, force: true });
});

function config(baseBranch: string) {
  return { ...defaultRepoConfig(newId()), baseBranch };
}

describe("repoBaseRef", () => {
  it("takes base_branch from the repo's config first", async () => {
    await gitIn(path, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/develop"]);
    expect(await repoBaseRef(path, config("release"))).toBe("release");
  });

  it("follows origin/HEAD when the repo has no config", async () => {
    await gitIn(path, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/develop"]);
    expect(await repoBaseRef(path, null)).toBe("develop");
  });

  it("falls back to the branch the checkout is on", async () => {
    expect(await repoBaseRef(path, null)).toBe("main");
  });

  it("tries the conventional names when the checkout is detached", async () => {
    await gitIn(path, ["checkout", "-q", "--detach", "HEAD"]);
    expect(await repoBaseRef(path, null)).toBe("main");
  });

  it("tries master too, when a detached checkout has that but not main", async () => {
    await gitIn(path, ["branch", "-m", "main", "master"]);
    await gitIn(path, ["checkout", "-q", "--detach", "HEAD"]);
    expect(await repoBaseRef(path, null)).toBe("master");
  });

  it("refuses to guess when a detached checkout has neither name", async () => {
    await gitIn(path, ["branch", "-m", "main", "trunk"]);
    await gitIn(path, ["checkout", "-q", "--detach", "HEAD"]);
    await expect(repoBaseRef(path, null)).rejects.toMatchObject({ code: "base-unresolved" });
  });
});

describe("refCommit", () => {
  it("resolves a local branch to its commit", async () => {
    const head = (await gitIn(path, ["rev-parse", "HEAD"])).stdout;
    expect(await refCommit(path, "main")).toBe(head);
  });

  it("answers null for a ref this checkout does not have", async () => {
    expect(await refCommit(path, "develop")).toBeNull();
  });
});
