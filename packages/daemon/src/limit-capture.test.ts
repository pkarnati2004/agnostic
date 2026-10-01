import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agnosticPaths } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { limitCapture } from "./limit-capture.js";

let home = "";

const scope = (claudeStatusline: "user" | "repo" = "user") => ({
  home,
  env: {},
  paths: agnosticPaths(join(home, ".agnostic")),
  config: { claudeStatusline },
});

async function writeUserStatusLine(command: string): Promise<void> {
  await mkdir(join(home, ".claude"), { recursive: true });
  await writeFile(
    join(home, ".claude", "settings.json"),
    JSON.stringify({ statusLine: { type: "command", command } }),
    "utf8",
  );
}

const script = () => join(home, ".agnostic", "hooks", "statusline.sh");

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-capture-"));
});

afterEach(() => rm(home, { recursive: true, force: true }));

describe("limitCapture", () => {
  it("captures every Claude Code session once agn owns the user-scope status line", async () => {
    await writeUserStatusLine(`sh '${script()}'`);
    expect(await limitCapture("claude-code", true, scope())).toBe("all-sessions");
  });

  it("captures nothing from Claude Code while the slot is empty or the user's", async () => {
    expect(await limitCapture("claude-code", true, scope())).toBe("none");
    await writeUserStatusLine("starship");
    expect(await limitCapture("claude-code", true, scope())).toBe("none");
  });

  it("captures agn's tasks only when the user opts the status line out", async () => {
    await writeUserStatusLine(`sh '${script()}'`);
    expect(await limitCapture("claude-code", true, scope("repo"))).toBe("agn-tasks");
  });

  it("captures nothing for a harness that is not installed", async () => {
    await writeUserStatusLine(`sh '${script()}'`);
    expect(await limitCapture("claude-code", false, scope())).toBe("none");
    expect(await limitCapture("codex", false, scope())).toBe("none");
  });

  it("captures every Codex session, which reports limits in its own rollouts", async () => {
    expect(await limitCapture("codex", true, scope())).toBe("all-sessions");
  });

  it("captures nothing for a harness that reports no limit anywhere", async () => {
    expect(await limitCapture("gemini", true, scope())).toBe("none");
    expect(await limitCapture("aider", true, scope())).toBe("none");
  });
});
