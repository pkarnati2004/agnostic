import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agnosticPaths, type RepoListRow } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CliError } from "./error.js";
import { resolveRepo, worktreeTask } from "./resolve-repo.js";
import { createTestContext } from "./test-context.js";

let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "agn-resolve-")));
});

afterEach(() => rm(root, { recursive: true, force: true }));

function repo(id: string, path: string): RepoListRow {
  return {
    id,
    path,
    kind: "git",
    name: "fixture",
    addedAt: "2026-09-11T10:00:00.000Z",
    testCommand: null,
  };
}

function context(cwd: string, repos: RepoListRow[]) {
  return createTestContext({
    cwd,
    paths: agnosticPaths(join(root, "home")),
    client: { listRepos: () => Promise.resolve({ repos, cursor: 0 }) },
  });
}

describe("resolveRepo", () => {
  it("passes an id or prefix through untouched", async () => {
    const { ctx } = context(root, []);
    expect(await resolveRepo(ctx, "abc")).toEqual({ repoId: "abc", taskId: null });
  });

  it("matches a path flag against the registered real paths", async () => {
    const path = join(root, "web");
    await mkdir(path);
    const { ctx } = context(root, [repo("r1", path)]);
    expect(await resolveRepo(ctx, "./web")).toEqual({ repoId: "r1", taskId: null });
  });

  it("refuses a path that is not registered", async () => {
    const path = join(root, "web");
    await mkdir(path);
    const { ctx } = context(root, []);
    await expect(resolveRepo(ctx, "./web")).rejects.toMatchObject({ code: "repo-not-registered" });
  });

  it("reads both ids from a worktree the daemon created", async () => {
    const { ctx } = context(join(root, "home", "worktrees", "r7k2m4pqrs", "t3n9v2wxyz"), []);
    expect(await resolveRepo(ctx, undefined)).toEqual({
      repoId: "r7k2m4pqrs",
      taskId: "t3n9v2wxyz",
    });
  });

  it("picks the innermost repo when one is nested inside another", async () => {
    const outer = join(root, "mono");
    const inner = join(outer, "packages", "api");
    await mkdir(inner, { recursive: true });
    const { ctx } = context(inner, [repo("outer", outer), repo("inner", inner)]);
    expect((await resolveRepo(ctx, undefined)).repoId).toBe("inner");
  });

  it("does not treat a sibling with a shared prefix as a parent", async () => {
    const registered = join(root, "repo");
    const other = join(root, "repo-other");
    await mkdir(registered);
    await mkdir(other);
    const { ctx } = context(other, [repo("r1", registered)]);
    await expect(resolveRepo(ctx, undefined)).rejects.toBeInstanceOf(CliError);
  });

  it("names `agn add .` when the directory belongs to no repo", async () => {
    const { ctx } = context(root, []);
    await expect(resolveRepo(ctx, undefined)).rejects.toMatchObject({
      code: "repo-not-resolved",
      hint: "Run `agn add .` here, or pass --repo <id or path>.",
    });
  });
});

describe("worktreeTask", () => {
  it("is null outside the worktrees directory", async () => {
    const paths = agnosticPaths(join(root, "home"));
    expect(await worktreeTask(paths, root)).toBeNull();
    expect(await worktreeTask(paths, paths.worktrees)).toBeNull();
  });
});
