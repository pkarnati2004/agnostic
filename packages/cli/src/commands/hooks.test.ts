import type { HookInstallResult, HooksInstallRequest, StatusLineInstall } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { createTestContext } from "../test-context.js";
import { hooksCommand } from "./hooks.js";

const REPO = { id: "r7k2m4pqrs", name: "app", path: "/work/app", kind: "git" as const };

function cli(installs: HookInstallResult[], statusLine: StatusLineInstall | null = null) {
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
        return Promise.resolve({ installs, statusLine });
      },
      uninstallHooks: (repoId, body) => {
        asked.push({ repoId, body });
        return Promise.resolve({ uninstalls: installs, statusLine });
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

  it("prints the one thing a Gemini install leaves to the user", async () => {
    const test = cli([
      result({
        harness: "gemini",
        file: "/home/u/.gemini/settings.json",
        verify:
          "Gemini has no permission hook: a permission prompt shows as running until you answer it",
      }),
    ]);
    await hooksCommand(test.ctx).parseAsync(["install", "--repo", REPO.id, "--harness", "gemini"], {
      from: "user",
    });
    expect(test.out).toEqual([
      "installed gemini hooks: /home/u/.gemini/settings.json",
      "  verify: Gemini has no permission hook: a permission prompt shows as running until you answer it",
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
    expect(JSON.parse(test.out.join("\n"))).toEqual({ installs: [result()], statusLine: null });
  });

  it("names the file the status line went in and which sessions it covers", async () => {
    const test = cli([result()], {
      file: "/home/u/.claude/settings.json",
      changed: true,
      capture: "all-sessions",
    });
    await hooksCommand(test.ctx).parseAsync(["install", "--repo", REPO.id], { from: "user" });
    expect(test.out.slice(1)).toEqual([
      "installed claude-code status line: /home/u/.claude/settings.json",
      "  status-line capture: all sessions",
    ]);
  });

  it("says the status line was already there", async () => {
    const test = cli([result()], {
      file: "/home/u/.claude/settings.json",
      changed: false,
      capture: "all-sessions",
    });
    await hooksCommand(test.ctx).parseAsync(["install", "--repo", REPO.id], { from: "user" });
    expect(test.out.slice(1)).toEqual([
      "claude-code status line already installed: /home/u/.claude/settings.json",
      "  status-line capture: all sessions",
    ]);
  });

  it("says the user's settings file was left out of it, and what that costs", async () => {
    const test = cli([result()], {
      file: "/home/u/.claude/settings.json",
      changed: false,
      capture: "agn-tasks",
    });
    await hooksCommand(test.ctx).parseAsync(["install", "--repo", REPO.id], { from: "user" });
    expect(test.out.slice(1)).toEqual([
      "left out of /home/u/.claude/settings.json (hooks.claude_statusline: repo)",
      "  status-line capture: agn tasks only",
    ]);
  });
});

describe("agn hooks uninstall", () => {
  it("removes the hooks and restores the status line", async () => {
    const test = cli([result()], {
      file: "/home/u/.claude/settings.json",
      changed: true,
      capture: "none",
    });
    await hooksCommand(test.ctx).parseAsync(["uninstall", "--repo", REPO.id], { from: "user" });
    expect(test.asked).toEqual([{ repoId: REPO.id, body: {} }]);
    expect(test.out).toEqual([
      "removed claude-code hooks: /work/app/.claude/settings.local.json",
      "restored your own status line: /home/u/.claude/settings.json",
    ]);
  });

  it("says when there was nothing of agn's to remove", async () => {
    const test = cli([result({ changed: false })], {
      file: "/home/u/.claude/settings.json",
      changed: false,
      capture: "none",
    });
    await hooksCommand(test.ctx).parseAsync(
      ["uninstall", "--repo", REPO.id, "--harness", "claude-code"],
      {
        from: "user",
      },
    );
    expect(test.asked).toEqual([{ repoId: REPO.id, body: { harness: "claude-code" } }]);
    expect(test.out).toEqual([
      "claude-code had no hooks of agn's: /work/app/.claude/settings.local.json",
      "no status line of agn's in /home/u/.claude/settings.json",
    ]);
  });

  it("prints the daemon's answer verbatim with --json", async () => {
    const test = cli([result()]);
    test.ctx.json = true;
    await hooksCommand(test.ctx).parseAsync(["uninstall", "--repo", REPO.id], { from: "user" });
    expect(JSON.parse(test.out.join("\n"))).toEqual({
      uninstalls: [result()],
      statusLine: null,
    });
  });
});
