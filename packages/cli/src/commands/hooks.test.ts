import type { HookInstallResult, HooksInstallRequest } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { createTestContext } from "../test-context.js";
import { hooksCommand } from "./hooks.js";

const REPO = { id: "r7k2m4pqrs", name: "app", path: "/work/app", kind: "git" as const };

function cli(installs: HookInstallResult[]) {
  const asked: { repoId: string; body: HooksInstallRequest }[] = [];
  const test = createTestContext({
    client: {
      listRepos: () =>
        Promise.resolve({
          repos: [
            {
              ...REPO,
              addedAt: "",
              status: "active" as const,
              testCommand: null,
              pathPresent: true,
            },
          ],
          cursor: 0,
        }),
      installHooks: (repoId, body) => {
        asked.push({ repoId, body });
        return Promise.resolve({ installs });
      },
    },
    cwd: "/work/app",
  });
  return { ...test, asked };
}

function result(over: Partial<HookInstallResult> = {}): HookInstallResult {
  return {
    harness: "claude-code",
    file: "/work/app/.claude/settings.local.json",
    changed: true,
    verify: null,
    ...over,
  };
}

describe("agn hooks install", () => {
  it("asks the daemon to install for the named harness", async () => {
    const test = cli([result({ harness: "codex", file: "/home/u/.codex/hooks.json" })]);
    await hooksCommand(test.ctx).parseAsync(["install", "--repo", REPO.id, "--harness", "codex"], {
      from: "user",
    });
    expect(test.asked).toEqual([{ repoId: REPO.id, body: { harness: "codex" } }]);
    expect(test.out).toEqual(["installed codex hooks: /home/u/.codex/hooks.json"]);
  });

  it("asks for every harness when none is named", async () => {
    const test = cli([result()]);
    await hooksCommand(test.ctx).parseAsync(["install", "--repo", REPO.id], { from: "user" });
    expect(test.asked[0]?.body).toEqual({});
  });

  it("says when a hook was already there, and prints what agn could not do itself", async () => {
    const test = cli([
      result({ changed: false }),
      result({
        harness: "codex",
        file: "/home/u/.codex/hooks.json",
        verify: "approve it in /hooks",
      }),
    ]);
    await hooksCommand(test.ctx).parseAsync(["install", "--repo", REPO.id], { from: "user" });
    expect(test.out).toEqual([
      "claude-code hooks already installed: /work/app/.claude/settings.local.json",
      "installed codex hooks: /home/u/.codex/hooks.json",
      "  verify: approve it in /hooks",
    ]);
  });

  it("says so when no harness on this machine has a hook", async () => {
    const test = cli([]);
    await hooksCommand(test.ctx).parseAsync(["install", "--repo", REPO.id], { from: "user" });
    expect(test.out).toEqual(["no harness on this machine has a hook agn can install"]);
  });

  it("prints the daemon's answer verbatim with --json", async () => {
    const test = cli([result()]);
    test.ctx.json = true;
    await hooksCommand(test.ctx).parseAsync(["install", "--repo", REPO.id], { from: "user" });
    expect(JSON.parse(test.out.join("\n"))).toEqual({ installs: [result()] });
  });
});
