import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CreatePrResponse,
  type Repo,
  readRepoConfig,
  type Task,
  type ToolReport,
  writeRepoConfig,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";
import { launchDetection } from "../test-detection.js";
import { type GhShim, installGhShim } from "../test-gh-shim.js";
import { type GitRecorder, recordGit } from "../test-git-recorder.js";
import { acceptTask, commitLines, gitIn, repoWithConfig, startTask } from "../test-task-run.js";

const ORIGIN = "git@github.com:o/r.git";
const CREATED = "https://github.com/o/r/pull/12";

let daemon: TestDaemon;
let repo: Repo;
let task: Task;
let worktree = "";
let git: GitRecorder;
let gh: GhShim;
let ghDir = "";
let tools: ToolReport[] = [];

beforeEach(async () => {
  ghDir = await mkdtemp(join(tmpdir(), "agn-gh-shim-"));
  gh = await installGhShim(ghDir);
  await gh.auth(0);
  await gh.view(1);
  await gh.create({ url: CREATED });
  tools = [{ tool: "gh", path: gh.path, version: "2.0.0", login: "logged-in" }];
  git = await recordGit();
  daemon = await createTestDaemon({
    tmux: true,
    // The daemon pushes with its own environment, so the recorder goes on that PATH, not this one.
    pathPrefix: git.dir,
    // The launch environment is built under the daemon's own home, which is what `paths` names.
    detect: (paths) => Promise.resolve({ ...launchDetection(join(paths.home, "bin"), []), tools }),
  });
  repo = await repoWithConfig(daemon);
  task = await startTask(daemon, repo);
  worktree = task.worktreePath ?? "";
  // A worktree shares its repo's config, so this is the checkout's origin too.
  await gitIn(worktree, ["remote", "add", "origin", ORIGIN]);
  await commitLines(worktree, 3);
});

afterEach(async () => {
  git.restore();
  await daemon.close();
  await rm(ghDir, { recursive: true, force: true });
});

async function post(body: unknown = {}, id = task.id): Promise<Response> {
  return daemon.request(`/tasks/${id}/pr`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function created(body: unknown = {}, id = task.id): Promise<CreatePrResponse> {
  const response = await post(body, id);
  expect(response.status).toBe(201);
  return (await response.json()) as CreatePrResponse;
}

type Failure = { code: string; message: string; hint: string };

async function refused(response: Response, status: number): Promise<Failure> {
  expect(response.status).toBe(status);
  return ((await response.json()) as { error: Failure }).error;
}

async function ghCall(verb: string): Promise<string[] | undefined> {
  return (await gh.calls()).find((call) => call[1] === verb);
}

async function pushes(): Promise<string[][]> {
  return (await git.calls()).filter((call) => call.includes("push"));
}

/** A second task whose base commit is on the first task's branch: `agn run --base <task>`. */
async function stacked(): Promise<{ parent: Task; child: Task }> {
  const parent = await startTask(daemon, repo);
  await commitLines(parent.worktreePath ?? "", 2, "parent.txt");
  const child = await startTask(daemon, repo, { base: parent.id });
  await commitLines(child.worktreePath ?? "", 2, "child.txt");
  return { parent, child };
}

describe("POST /tasks/:id/pr", () => {
  it("pushes the branch once and opens the pull request with gh", async () => {
    const body = await created();
    expect(body).toMatchObject({ via: "gh", url: CREATED, pushed: true, base: "main" });
    expect(body.branch).toBe(task.branch);
    expect(await pushes()).toEqual([
      ["-C", worktree, "push", "--porcelain", "--set-upstream", "origin", task.branch ?? ""],
    ]);
    expect(await ghCall("create")).toEqual([
      "pr",
      "create",
      "--head",
      task.branch,
      "--base",
      "main",
      "--title",
      body.task.title,
      "--body-file",
      expect.any(String),
    ]);
    expect(await gh.body()).toBe(body.body);
    expect(body.body).toContain("## Spec");
    expect(body.body).toContain(`agn task ${task.id}`);
  });

  it("takes the title the caller asked for", async () => {
    await created({ title: "Ship the invite links" });
    expect(await ghCall("create")).toContain("Ship the invite links");
  });

  it("answers the open pull request rather than creating a second one", async () => {
    await gh.view(0, "https://github.com/o/r/pull/3");
    const body = await created();
    expect(body).toMatchObject({ via: "gh", url: "https://github.com/o/r/pull/3" });
    expect(await ghCall("create")).toBeUndefined();
  });

  it("hands back the compare page when gh is not logged in", async () => {
    await gh.auth(1);
    const body = await created();
    expect(body.via).toBe("compare");
    expect(body.url).toBe(
      `https://github.com/o/r/compare/main...${task.branch}?expand=1&title=${encodeURIComponent(body.task.title)}`,
    );
    expect(body.pushed).toBe(true);
    expect(await ghCall("create")).toBeUndefined();
  });

  it("hands back the compare page when this machine has no gh", async () => {
    tools = [];
    expect((await daemon.request("/doctor", { method: "POST" })).status).toBe(200);
    expect((await created()).via).toBe("compare");
    expect(await gh.calls()).toEqual([]);
  });

  it("says what git said when the push was refused, and asks gh nothing", async () => {
    git.answerPush({
      exitCode: 1,
      stdout: "To origin\n!\trefs/heads/x:refs/heads/x\t[rejected] (fetch first)\nDone\n",
      stderr: "error: failed to push some refs\n",
    });
    const error = await refused(await post(), 409);
    expect(error.code).toBe("push-rejected");
    expect(error.hint).toContain("agn update");
    expect(await gh.calls()).toEqual([]);
  });

  it("refuses a remote that is not GitHub, before it pushes", async () => {
    await gitIn(worktree, ["remote", "set-url", "origin", "https://gitlab.com/o/r.git"]);
    const error = await refused(await post(), 409);
    expect(error.code).toBe("remote-not-github");
    expect(await pushes()).toEqual([]);
  });

  it("refuses a GitHub Enterprise host, which is not github.com, before it pushes", async () => {
    await gitIn(worktree, ["remote", "set-url", "origin", "https://github.example.com/o/r.git"]);
    const error = await refused(await post(), 409);
    expect(error.code).toBe("remote-not-github");
    expect(await pushes()).toEqual([]);
  });

  it("refuses an ssh:// remote that does not name github.com, before it pushes", async () => {
    await gitIn(worktree, ["remote", "set-url", "origin", "ssh://git@example.com/o/r.git"]);
    const error = await refused(await post(), 409);
    expect(error.code).toBe("remote-not-github");
    expect(await pushes()).toEqual([]);
  });

  it("refuses a repo with no origin", async () => {
    await gitIn(worktree, ["remote", "remove", "origin"]);
    const error = await refused(await post(), 409);
    expect(error.code).toBe("remote-missing");
    expect(error.hint).toContain("git remote add origin");
    expect(await pushes()).toEqual([]);
  });

  it("refuses a branch with no commits of its own, before it pushes", async () => {
    const empty = await startTask(daemon, repo);
    const error = await refused(await post({}, empty.id), 409);
    expect(error.code).toBe("branch-empty");
    expect(await pushes()).toEqual([]);
  });

  it("refuses a folder workspace", async () => {
    const folder = await repoWithConfig(daemon, { git: false });
    const inPlace = await startTask(daemon, folder);
    expect((await refused(await post({}, inPlace.id), 409)).code).toBe("repo-not-git");
  });

  it("refuses a branch that is what the repo branches from, before it pushes", async () => {
    const config = await readRepoConfig(repo.path);
    if (config === null) {
      throw new Error("this test needs a repo with agnostic.yaml");
    }
    await writeRepoConfig(repo.path, { ...config, baseBranch: task.branch ?? "" });
    const error = await refused(await post(), 409);
    expect(error.code).toBe("branch-is-base");
    expect(await pushes()).toEqual([]);
  });

  it("targets the parent task's branch, and the base branch once the parent is accepted", async () => {
    const { parent, child } = await stacked();
    expect((await created({}, child.id)).base).toBe(parent.branch);
    expect(await ghCall("create")).toContain(parent.branch);
    acceptTask(daemon, parent, 2);
    expect((await created({}, child.id)).base).toBe("main");
  });

  it("still shows the branch pushed when gh fails to create the pull request", async () => {
    await gh.create({ exitCode: 1, stderr: "GraphQL: something went wrong\n" });
    const error = await refused(await post(), 502);
    expect(error.code).toBe("gh-failed");
    expect(error.message).toContain("GraphQL: something went wrong");
    expect(error.hint).toContain("gh auth status");
    // The push is agn's one write to the remote, and it already happened before gh was asked.
    expect(await pushes()).toEqual([
      ["-C", worktree, "push", "--porcelain", "--set-upstream", "origin", task.branch ?? ""],
    ]);
  });

  it("removes the --body-file temp file once gh has read it", async () => {
    await created();
    const create = await ghCall("create");
    const at = (create ?? []).indexOf("--body-file");
    expect(at).toBeGreaterThan(-1);
    const bodyFile = create?.[at + 1] ?? "";
    expect(existsSync(bodyFile)).toBe(false);
  });

  it("says to open the parent's PR first when gh refuses a stacked one", async () => {
    const { parent, child } = await stacked();
    await gh.create({ exitCode: 1, stderr: "could not find the base branch\n" });
    const error = await refused(await post({}, child.id), 502);
    expect(error.code).toBe("gh-failed");
    expect(error.message).toContain("could not find the base branch");
    expect(error.hint).toBe(`Open the parent's PR first: \`agn pr ${parent.id}\`.`);
  });

  it("pushes from the main checkout once the worktree has been cleaned", async () => {
    await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" });
    const cleaned = await daemon.request(`/tasks/${task.id}/clean`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force: true }),
    });
    expect(cleaned.status).toBe(200);
    expect(await created()).toMatchObject({ via: "gh", pushed: true });
    expect(await pushes()).toEqual([
      ["-C", repo.path, "push", "--porcelain", "--set-upstream", "origin", task.branch ?? ""],
    ]);
  });

  it("pushes to origin and nothing else, and never forces it", async () => {
    await created();
    for (const push of await pushes()) {
      expect(push).toContain("origin");
      expect(push).not.toContain("--force");
      expect(push).not.toContain("--force-with-lease");
      expect(push).not.toContain("-f");
    }
  });

  it("never asks git for a force push or a + refspec, in any command the route runs", async () => {
    const { child } = await stacked();
    await created({}, child.id);
    await created();
    const calls = await git.calls();
    expect(calls.filter((call) => call.includes("push")).length).toBe(2);
    for (const call of calls) {
      expect(call).not.toContain("--force");
      expect(call).not.toContain("--force-with-lease");
      expect(call).not.toContain("-f");
      for (const arg of call) {
        expect(arg.startsWith("+")).toBe(false);
      }
    }
  });
});
