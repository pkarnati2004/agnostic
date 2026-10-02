import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Repo, Task, TaskResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";

const PROFILE = "claude-code:default:native";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
  await daemon.serve();
});

afterEach(() => daemon.close());

async function start(repo: Repo): Promise<Task> {
  const response = await daemon.request(`/repos/${repo.id}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "do the thing", profile: PROFILE }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as TaskResponse).task;
}

function userHome(): string {
  return daemon.launch?.env.HOME ?? "";
}

async function writeUserSettings(config: unknown): Promise<void> {
  await mkdir(join(userHome(), ".claude"), { recursive: true });
  await writeFile(
    join(userHome(), ".claude", "settings.json"),
    JSON.stringify(config, null, 2),
    "utf8",
  );
}

async function userStatusLine(): Promise<unknown> {
  const text = await readFile(join(userHome(), ".claude", "settings.json"), "utf8");
  return (JSON.parse(text) as { statusLine?: unknown }).statusLine;
}

describe("the status line a launch installs for the user", () => {
  it("installs the status line in the user's own settings file when a task starts", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    await writeUserSettings({ statusLine: { type: "command", command: "mine", padding: 0 } });

    await start(repo);

    expect(await userStatusLine()).toEqual({
      type: "command",
      command: `sh '${join(daemon.paths.hooks, "statusline.sh")}' 'mine'`,
      padding: 0,
    });
  });

  it("puts the user's own status line back on the next launch after they opt out", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    await writeUserSettings({ statusLine: { type: "command", command: "mine" } });
    await start(repo);
    await writeFile(daemon.paths.config, "hooks:\n  claude_statusline: repo\n", "utf8");

    await start(repo);

    expect(await userStatusLine()).toEqual({ type: "command", command: "mine" });
  });

  it("starts the task when the user's settings file cannot be read, and logs why", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    await mkdir(join(userHome(), ".claude"), { recursive: true });
    await writeFile(join(userHome(), ".claude", "settings.json"), "{ not json", "utf8");

    const task = await start(repo);

    expect(task.status).toBe("running");
    const log = await daemon.readLog();
    expect(log).toContain("hooks install failed harness=claude-code code=hook-config-unreadable");
    expect(log.split("hooks install failed").length - 1).toBe(1);
    expect(
      await readFile(join(task.session?.cwd ?? "", ".claude", "settings.local.json"), "utf8"),
    ).toContain("post.sh");
  });
});
