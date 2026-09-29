import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agnosticPaths, type RepoListRow } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CliError } from "./error.js";
import { resolveRepo, resolveRepoPath, worktreeTask } from "./resolve-repo.js";
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
    status: "active",
    testCommand: null,
    pathPresent: true,
  };
}

function context(cwd: string, repos: RepoListRow[]) {
  const queries: (boolean | undefined)[] = [];
  const test = createTestContext({
    cwd,
    paths: agnosticPaths(join(root, "home")),
    client: {
      listRepos: (query) => {
        queries.push(query?.all);
        return Promise.resolve({ repos, cursor: 0 });
      },
    },
  });
  return { ...test, queries };
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

  it("resolves a closed repo by path, so the daemon is the one that refuses the run", async () => {
    const path = join(root, "web");
    await mkdir(path);
    const { ctx, queries } = context(root, [{ ...repo("r1", path), status: "archived" }]);
    expect(await resolveRepo(ctx, "./web")).toEqual({ repoId: "r1", taskId: null });
    expect(queries).toEqual([true]);
  });

  it("resolves the current directory to a closed repo rather than calling it unregistered", async () => {
    const path = join(root, "web");
    await mkdir(path);
    const { ctx, queries } = context(path, [{ ...repo("r1", path), status: "archived" }]);
    expect((await resolveRepo(ctx, undefined)).repoId).toBe("r1");
    expect(queries).toEqual([true]);
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

describe("resolveRepoPath", () => {
  it("answers the registered checkout, not the worktree the shell is in", async () => {
    const path = join(root, "web");
    const worktree = join(root, "home", "worktrees", "r7k2m4pqrs", "t3n9v2wxyz");
    await mkdir(path);
    await mkdir(worktree, { recursive: true });
    const { ctx } = context(worktree, [repo("r7k2m4pqrs", path)]);
    expect(await resolveRepoPath(ctx, undefined)).toEqual({ repoId: "r7k2m4pqrs", path });
  });

  it("resolves an id prefix the way the daemon does", async () => {
    const path = join(root, "web");
    await mkdir(path);
    const { ctx } = context(root, [repo("r7k2m4pqrs", path)]);
    expect(await resolveRepoPath(ctx, "r7k")).toEqual({ repoId: "r7k2m4pqrs", path });
  });

  it("refuses a prefix that matches two repos", async () => {
    const { ctx } = context(root, [repo("r7k2m4pqrs", "/a"), repo("r7k9x1abcd", "/b")]);
    await expect(resolveRepoPath(ctx, "r7k")).rejects.toMatchObject({ code: "ambiguous-id" });
  });

  it("refuses an id no repo carries", async () => {
    const { ctx } = context(root, [repo("r7k2m4pqrs", "/a")]);
    await expect(resolveRepoPath(ctx, "zzz")).rejects.toMatchObject({ code: "repo-not-found" });
  });

  it("answers a closed repo's path too, the way `agn workflow` needs to read its .ag/", async () => {
    const { ctx } = context(root, [{ ...repo("r7k2m4pqrs", "/a"), status: "archived" }]);
    expect(await resolveRepoPath(ctx, "r7k2m4pqrs")).toEqual({ repoId: "r7k2m4pqrs", path: "/a" });
  });

  it("answers the registered path even when the row says it is not on disk right now", async () => {
    const { ctx } = context(root, [{ ...repo("r7k2m4pqrs", "/a"), pathPresent: false }]);
    expect(await resolveRepoPath(ctx, "r7k2m4pqrs")).toEqual({ repoId: "r7k2m4pqrs", path: "/a" });
  });
});
