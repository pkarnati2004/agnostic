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
    testCommand: null,
  };
}

function run(repos: RepoListRow[]) {
  const cli = createTestContext({ client: { listRepos: () => Promise.resolve({ repos }) } });
  return { cli, done: () => reposCommand(cli.ctx).parseAsync([], { from: "user" }) };
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

  it("tells the user how to add one when the list is empty", async () => {
    const { cli, done } = run([]);
    await done();
    expect(cli.out).toEqual(["no repos yet; run agn add <path>"]);
  });

  it("prints the response verbatim with --json", async () => {
    const { cli, done } = run([repo("r1", "api", "git")]);
    cli.ctx.json = true;
    await done();
    expect(JSON.parse(cli.out.join("\n"))).toEqual({ repos: [repo("r1", "api", "git")] });
  });
});
