import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type Repo, run, type Task, type TaskResponse, worktreePath } from "@agnostic/core";
import { GENERATED_HEADER } from "@agnostic/sync";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";
import { seedTranscript } from "./test-transcript.js";

const PROFILE = "claude-code:default:native";
const INSTRUCTIONS = "# app\n\nRun `pnpm test` before you finish.\n";

const MCP = `servers:
  db:
    command: npx
    env:
      DATABASE_URL: $DATABASE_URL
`;

let daemon: TestDaemon;

beforeEach(async () => {
  // A sync that writes the user's Codex config says so on stderr; the test does not need to see it.
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
  daemon = await createTestDaemon({ tmux: true });
});

afterEach(() => daemon.close());

/** A worktree is cut from a commit, so the files a task reads have to be committed first. */
async function commit(repoPath: string, files: Record<string, string>): Promise<void> {
  for (const [file, text] of Object.entries(files)) {
    await mkdir(dirname(join(repoPath, file)), { recursive: true });
    await writeFile(join(repoPath, file), text, "utf8");
  }
  await run("git", ["-C", repoPath, "add", "-A"]);
  await run("git", [
    "-C",
    repoPath,
    "-c",
    "user.email=t@agn.test",
    "-c",
    "user.name=agn test",
    "commit",
    "-q",
    "-m",
    "project context",
  ]);
}

async function runTask(repo: Repo): Promise<Task> {
  const response = await daemon.request(`/repos/${repo.id}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "add a --verbose flag" }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as TaskResponse).task;
}

async function started(task: Task): Promise<string> {
  await waitFor("the fake agent to start", async () =>
    ((await daemon.launch?.readLog()) ?? "").includes(`AGN_TASK_ID=${task.id}`),
  );
  return worktreePath(daemon.paths, task.repoId, task.id);
}

describe("a task's worktree is synced before the agent starts", () => {
  it("generates the instruction files from the worktree's own .ag/instructions.md", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    // The post-init state, committed: instructions.md is what CLAUDE.md held.
    await commit(repo.path, { ".ag/instructions.md": INSTRUCTIONS, "CLAUDE.md": INSTRUCTIONS });
    const cwd = await started(await runTask(repo));

    expect(await readFile(join(cwd, "CLAUDE.md"), "utf8")).toBe(
      `${GENERATED_HEADER}\n\n@AGENTS.md\n`,
    );
    expect(await readFile(join(cwd, "AGENTS.md"), "utf8")).toBe(
      `${GENERATED_HEADER}\n\n${INSTRUCTIONS}`,
    );
  });

  it("runs a repo with no .ag/ exactly as before", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const cwd = await started(await runTask(repo));

    await expect(readFile(join(cwd, "AGENTS.md"), "utf8")).rejects.toThrow();
    expect(await daemon.readLog()).not.toContain("sync skipped");
  });

  it("starts the task on the existing file when that file was written by hand", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const byHand = "# app\n\nMy own words.\n";
    await commit(repo.path, { ".ag/instructions.md": INSTRUCTIONS, "CLAUDE.md": byHand });
    const task = await runTask(repo);
    const cwd = await started(task);

    expect(await readFile(join(cwd, "CLAUDE.md"), "utf8")).toBe(byHand);
    await waitFor("the daemon to log the skipped sync", async () =>
      (await daemon.readLog()).includes("sync skipped"),
    );
    expect(await daemon.readLog()).toContain("code=sync-conflict");
  });

  it("writes the MCP servers the worktree's own commit declares", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    await commit(repo.path, {
      ".ag/instructions.md": INSTRUCTIONS,
      "CLAUDE.md": INSTRUCTIONS,
      ".ag/mcp.yaml": MCP,
    });
    const cwd = await started(await runTask(repo));

    expect(await readFile(join(cwd, ".mcp.json"), "utf8")).toContain(
      `"DATABASE_URL": "\${DATABASE_URL}"`,
    );
    const codex = await readFile(join(daemon.home, ".codex", "config.toml"), "utf8");
    expect(codex).toContain(`# >>> agn mcp for ${repo.id}: managed block`);
  });

  it("syncs again before a fresh resume relaunches the agent", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    await commit(repo.path, { ".ag/instructions.md": INSTRUCTIONS, "CLAUDE.md": INSTRUCTIONS });
    const task = await runTask(repo);
    const cwd = await started(task);
    await rm(join(cwd, "AGENTS.md"));

    const stopped = await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" });
    expect(stopped.status).toBe(200);
    const resumed = await daemon.request(`/tasks/${task.id}/resume`, { method: "POST" });
    expect(resumed.status).toBe(200);
    // No hook ever reported a session id here, so this is the fresh-launch branch.
    expect(((await resumed.json()) as { via: string }).via).toBe("fresh");
    expect(await readFile(join(cwd, "AGENTS.md"), "utf8")).toBe(
      `${GENERATED_HEADER}\n\n${INSTRUCTIONS}`,
    );
  });

  it("syncs again before a native resume reattaches the agent", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    await commit(repo.path, { ".ag/instructions.md": INSTRUCTIONS, "CLAUDE.md": INSTRUCTIONS });
    const task = await runTask(repo);
    const cwd = await started(task);
    const session = task.session;
    if (session === undefined) {
      throw new Error("the launched task has no session");
    }
    // A recorded session id is what makes the resume "native" rather than a fresh relaunch.
    daemon.ledger.tasks.setSession(task.id, { ...session, sessionId: "sess-sync-42" });
    // And the transcript that id names, which is what the daemon checks before it hands it back.
    await seedTranscript(daemon, "sess-sync-42");
    await rm(join(cwd, "AGENTS.md"));

    expect((await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" })).status).toBe(200);
    const resumed = await daemon.request(`/tasks/${task.id}/resume`, { method: "POST" });
    expect(resumed.status).toBe(200);
    expect(((await resumed.json()) as { via: string }).via).toBe("native");
    expect(await readFile(join(cwd, "AGENTS.md"), "utf8")).toBe(
      `${GENERATED_HEADER}\n\n${INSTRUCTIONS}`,
    );
  });

  it("syncs a repo whose only .ag/ file is mcp.yaml, with no instructions.md", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    await commit(repo.path, { ".ag/mcp.yaml": MCP });
    const cwd = await started(await runTask(repo));

    expect(await readFile(join(cwd, ".mcp.json"), "utf8")).toContain('"db"');
    // Nothing to generate the instruction files from, and that is not a refusal.
    await expect(readFile(join(cwd, "AGENTS.md"), "utf8")).rejects.toThrow();
    expect(await daemon.readLog()).not.toContain("sync skipped");
  });
});

describe("a folder workspace is synced in place", () => {
  it("writes the instruction files straight into the repo path, no worktree involved", async () => {
    const repo = await daemon.addRepo({ git: false, defaultProfile: PROFILE });
    await mkdir(join(repo.path, ".ag"), { recursive: true });
    await writeFile(join(repo.path, ".ag", "instructions.md"), INSTRUCTIONS, "utf8");
    await writeFile(join(repo.path, "CLAUDE.md"), INSTRUCTIONS, "utf8");

    const task = await runTask(repo);
    await waitFor("the fake agent to start", async () =>
      ((await daemon.launch?.readLog()) ?? "").includes(`AGN_TASK_ID=${task.id}`),
    );

    expect(task.worktreePath).toBeNull();
    expect(await readFile(join(repo.path, "CLAUDE.md"), "utf8")).toBe(
      `${GENERATED_HEADER}\n\n@AGENTS.md\n`,
    );
    expect(await readFile(join(repo.path, "AGENTS.md"), "utf8")).toBe(
      `${GENERATED_HEADER}\n\n${INSTRUCTIONS}`,
    );
  });
});
