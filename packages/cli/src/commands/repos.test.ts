import type { Repo, RepoListRow } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { createTestContext } from "../test-context.js";
import { reposCommand } from "./repos.js";

function repo(id: string, name: string, kind: Repo["kind"]): RepoListRow {
  return {
    id,
    path: `/work/${name}`,
    kind,
    name,
    addedAt: "2026-09-11T10:00:00.000Z",
    status: "active",
    testCommand: null,
    pathPresent: true,
  };
}

function run(repos: RepoListRow[], argv: string[] = []) {
  const asked: ({ all?: boolean } | undefined)[] = [];
  const cli = createTestContext({
    client: {
      listRepos: (query) => {
        asked.push(query);
        return Promise.resolve({ repos, cursor: 0 });
      },
    },
  });
  return { cli, asked, done: () => reposCommand(cli.ctx).parseAsync(argv, { from: "user" }) };
}

describe("agn repos", () => {
  it("prints one line per repo, sorted by name", async () => {
    const { cli, done } = run([repo("r2", "web", "git"), repo("r1", "api", "folder")]);
    await done();
    expect(cli.out).toEqual([
      "id  name  kind    path",
      "r1  api   folder  /work/api",
      "r2  web   git     /work/web",
    ]);
  });

  it("asks for the active repos only, and shows no status column", async () => {
    const { cli, asked, done } = run([repo("r1", "api", "git")]);
    await done();
    expect(asked).toEqual([{ all: false }]);
    expect(cli.out[0]).toBe("id  name  kind  path");
  });

  it("asks for every repo with --all, and names each one's status", async () => {
    const closed: RepoListRow = { ...repo("r2", "web", "git"), status: "archived" };
    const { cli, asked, done } = run([repo("r1", "api", "git"), closed], ["--all"]);
    await done();
    expect(asked).toEqual([{ all: true }]);
    expect(cli.out).toEqual([
      "id  name  kind  path       status",
      "r1  api   git   /work/api  active",
      "r2  web   git   /work/web  archived",
    ]);
  });

  it("tells the user how to add one when the list is empty", async () => {
    const { cli, done } = run([]);
    await done();
    expect(cli.out).toEqual(["no repos yet; run agn add <path>"]);
  });

  it("marks a repo whose folder is gone, without touching a present one's path", async () => {
    const missing: RepoListRow = { ...repo("r1", "api", "git"), pathPresent: false };
    const { cli, done } = run([missing, repo("r2", "web", "git")]);
    await done();
    expect(cli.out).toEqual([
      "id  name  kind  path",
      "r1  api   git   /work/api (missing)",
      "r2  web   git   /work/web",
    ]);
  });

  it("carries pathPresent through --json untouched", async () => {
    const missing: RepoListRow = { ...repo("r1", "api", "git"), pathPresent: false };
    const { cli, done } = run([missing]);
    cli.ctx.json = true;
    await done();
    expect(JSON.parse(cli.out.join("\n"))).toEqual({ repos: [missing], cursor: 0 });
  });

  it("prints the response verbatim with --json, snapshot cursor and all", async () => {
    const { cli, done } = run([repo("r1", "api", "git")]);
    cli.ctx.json = true;
    await done();
    expect(JSON.parse(cli.out.join("\n"))).toEqual({
      repos: [repo("r1", "api", "git")],
      cursor: 0,
    });
  });
});
