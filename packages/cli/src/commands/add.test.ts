import type { RegisterRepoRequest, Repo } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { createTestContext } from "../test-context.js";
import { addCommand } from "./add.js";

const REPO: Repo = {
  id: "r1a2b3c4d5",
  path: "/work/api",
  kind: "git",
  name: "api",
  addedAt: "2026-09-11T10:00:00.000Z",
  status: "active",
};

function harness(created: boolean, repo: Repo = REPO) {
  const requests: RegisterRepoRequest[] = [];
  const cli = createTestContext({
    cwd: "/work",
    client: {
      registerRepo: (body) => {
        requests.push(body);
        return Promise.resolve({ repo, created });
      },
    },
  });
  return { ...cli, requests };
}

describe("agn add", () => {
  it("resolves a relative path against the current directory", async () => {
    const cli = harness(true);
    await addCommand(cli.ctx).parseAsync(["api"], { from: "user" });
    expect(cli.requests[0]?.path).toBe("/work/api");
    expect(cli.out).toEqual(["added api (git) r1a2b3c4d5"]);
  });

  it("passes --git-init and --new-id to the daemon", async () => {
    const cli = harness(true);
    await addCommand(cli.ctx).parseAsync(["/work/api", "--git-init", "--new-id"], {
      from: "user",
    });
    expect(cli.requests[0]).toEqual({ path: "/work/api", gitInit: true, newId: true });
  });

  it("says so when the repo was already registered", async () => {
    const cli = harness(false);
    await addCommand(cli.ctx).parseAsync(["/work/api"], { from: "user" });
    expect(cli.out).toEqual(["already registered: api (git) r1a2b3c4d5"]);
  });

  it("names the command that shows a closed repo again", async () => {
    const cli = harness(false, { ...REPO, status: "archived" });
    await addCommand(cli.ctx).parseAsync(["/work/api"], { from: "user" });
    expect(cli.out).toEqual(["already registered, closed: api (git) r1a2b3c4d5"]);
    expect(cli.err).toEqual([
      "  hint: Run `agn repo open r1a2b3c4d5` to show it in agn repos again.",
    ]);
  });

  it("prints the response and nothing else with --json", async () => {
    const cli = harness(true);
    cli.ctx.json = true;
    await addCommand(cli.ctx).parseAsync(["/work/api"], { from: "user" });
    expect(JSON.parse(cli.out.join("\n"))).toEqual({ repo: REPO, created: true });
  });
});
