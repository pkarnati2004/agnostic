import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newId, run, type Task } from "@agnostic/core";
import { afterEach, describe, expect, it } from "vitest";
import { type BranchFacts, detectVerdict, readBranchFacts } from "./branch-verdict.js";

const NOW = "2026-09-12T10:00:00.000Z";
const LATER = "2026-09-12T11:00:00.000Z";

const repos: string[] = [];

afterEach(async () => {
  for (const path of repos.splice(0)) {
    await rm(path, { recursive: true, force: true });
  }
});

/** A repo the test owns, with one commit on `main`. */
async function gitRepo(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "agn-branch-verdict-"));
  repos.push(path);
  await git(path, ["init", "-q", "-b", "main"]);
  await writeFile(join(path, "README.md"), "# fixture\n");
  await git(path, ["add", "README.md"]);
  await git(path, ["commit", "-q", "-m", "first"]);
  return path;
}

function git(cwd: string, args: string[], at = NOW): Promise<{ stdout: string }> {
  return run("git", ["-C", cwd, "-c", "user.email=t@agn.test", "-c", "user.name=agn", ...args], {
    env: { GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at },
  });
}

async function headOf(cwd: string, ref = "HEAD"): Promise<string> {
  return (await git(cwd, ["rev-parse", ref])).stdout.trim();
}

/** Adds a file of `lines` lines and commits it, at the given moment. */
async function commitLines(cwd: string, name: string, lines: number, at = NOW): Promise<string> {
  const body = Array.from({ length: lines }, (_unused, index) => `line ${index}`).join("\n");
  await writeFile(join(cwd, name), `${body}\n`);
  await git(cwd, ["add", name], at);
  await git(cwd, ["commit", "-q", "-m", `add ${name}`], at);
  return headOf(cwd);
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: newId(),
    repoId: "r7k2m4pqrs",
    title: "add lines",
    prompt: "p",
    profileId: "claude-code:opus:native",
    worktreePath: null,
    branch: null,
    status: "done",
    origin: "agn",
    baseCommit: null,
    compareId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe("readBranchFacts", () => {
  it("has nothing to report for a task with no branch of its own", async () => {
    const repo = await gitRepo();
    const facts = await readBranchFacts(repo, task(), NOW);
    expect(facts).toEqual({
      agentTip: null,
      agentLines: null,
      branchExists: false,
      worktreeExists: false,
    });
  });

  it("finds the agent's tip and counts the lines it added over the base", async () => {
    const repo = await gitRepo();
    const base = await headOf(repo);
    await git(repo, ["switch", "-c", "agn/task"]);
    const tip = await commitLines(repo, "agent.txt", 10);

    const facts = await readBranchFacts(
      repo,
      task({ branch: "agn/task", baseCommit: base }),
      LATER,
    );
    expect(facts.branchExists).toBe(true);
    expect(facts.agentTip).toBe(tip);
    expect(facts.agentLines).toBe(10);
  });

  it("reports the branch as gone once it has been deleted", async () => {
    const repo = await gitRepo();
    const base = await headOf(repo);
    await git(repo, ["switch", "-c", "agn/task"]);
    await commitLines(repo, "agent.txt", 3);
    await git(repo, ["switch", "main"]);
    await git(repo, ["branch", "-D", "agn/task"]);

    const facts = await readBranchFacts(
      repo,
      task({ branch: "agn/task", baseCommit: base }),
      LATER,
    );
    expect(facts).toEqual({
      agentTip: null,
      agentLines: null,
      branchExists: false,
      worktreeExists: false,
    });
  });

  it("counts only the commits made before the task closed", async () => {
    const repo = await gitRepo();
    const base = await headOf(repo);
    await git(repo, ["switch", "-c", "agn/task"]);
    const agentTip = await commitLines(repo, "agent.txt", 10, NOW);
    // A reviewer's commit, made after the task closed, is not the agent's tip.
    await commitLines(repo, "reviewer.txt", 4, LATER);

    const closedAt = "2026-09-12T10:30:00.000Z";
    const facts = await readBranchFacts(
      repo,
      task({ branch: "agn/task", baseCommit: base }),
      closedAt,
    );
    expect(facts.agentTip).toBe(agentTip);
    expect(facts.agentLines).toBe(10);
  });

  it("reports the worktree directory apart from the branch", async () => {
    const repo = await gitRepo();
    const worktreePath = join(repo, "..", `agn-worktree-${newId()}`);
    await mkdir(worktreePath, { recursive: true });
    repos.push(worktreePath);

    const there = await readBranchFacts(repo, task({ worktreePath }), NOW);
    expect(there.worktreeExists).toBe(true);

    await rm(worktreePath, { recursive: true, force: true });
    const gone = await readBranchFacts(repo, task({ worktreePath }), NOW);
    expect(gone.worktreeExists).toBe(false);
  });
});

describe("detectVerdict", () => {
  it("is neither accepted nor reverted for a branch with nothing beyond its base", async () => {
    const repo = await gitRepo();
    const base = await headOf(repo);
    await git(repo, ["switch", "-c", "agn/task"]);
    await git(repo, ["switch", "main"]);
    const facts: BranchFacts = {
      agentTip: base,
      agentLines: 0,
      branchExists: true,
      worktreeExists: true,
    };

    const verdict = await detectVerdict(
      repo,
      "main",
      task({ branch: "agn/task", baseCommit: base }),
      facts,
    );
    expect(verdict).toEqual({ accepted: false, reverted: false, humanChangedLines: 0 });
  });

  it("is accepted once a merge commit puts the branch in the base ref's history", async () => {
    const repo = await gitRepo();
    const base = await headOf(repo);
    await git(repo, ["switch", "-c", "agn/task"]);
    const tip = await commitLines(repo, "agent.txt", 10);
    await git(repo, ["switch", "main"]);
    await git(repo, ["merge", "--no-ff", "-q", "-m", "merge", "agn/task"]);

    const at = task({ branch: "agn/task", baseCommit: base });
    const facts = await readBranchFacts(repo, at, LATER);
    expect(facts.agentTip).toBe(tip);
    const verdict = await detectVerdict(repo, "main", at, facts);
    expect(verdict).toEqual({ accepted: true, reverted: false, humanChangedLines: 0 });
  });

  it("is accepted after a squash merge, where the branch is nobody's ancestor", async () => {
    const repo = await gitRepo();
    const base = await headOf(repo);
    await git(repo, ["switch", "-c", "agn/task"]);
    await commitLines(repo, "agent.txt", 10);
    await git(repo, ["switch", "main"]);
    await git(repo, ["merge", "--squash", "agn/task"]);
    await git(repo, ["commit", "-q", "-m", "squashed"]);

    const at = task({ branch: "agn/task", baseCommit: base });
    const facts = await readBranchFacts(repo, at, LATER);
    const verdict = await detectVerdict(repo, "main", at, facts);
    expect(verdict.accepted).toBe(true);
    expect(verdict.reverted).toBe(false);
  });

  it("is reverted once the branch itself is gone", async () => {
    const repo = await gitRepo();
    const base = await headOf(repo);
    await git(repo, ["switch", "-c", "agn/task"]);
    await commitLines(repo, "agent.txt", 3);
    await git(repo, ["switch", "main"]);
    await git(repo, ["branch", "-D", "agn/task"]);

    const at = task({ branch: "agn/task", baseCommit: base });
    const facts = await readBranchFacts(repo, at, NOW);
    const verdict = await detectVerdict(repo, "main", at, facts);
    expect(verdict).toEqual({ accepted: false, reverted: true, humanChangedLines: null });
  });

  it("is reverted when the worktree is gone but the branch is still there", async () => {
    const repo = await gitRepo();
    const base = await headOf(repo);
    await git(repo, ["switch", "-c", "agn/task"]);
    const tip = await commitLines(repo, "agent.txt", 3);
    await git(repo, ["switch", "main"]);
    const facts: BranchFacts = {
      agentTip: tip,
      agentLines: 3,
      branchExists: true,
      worktreeExists: false,
    };

    const verdict = await detectVerdict(
      repo,
      "main",
      task({ branch: "agn/task", baseCommit: base }),
      facts,
    );
    expect(verdict.accepted).toBe(false);
    expect(verdict.reverted).toBe(true);
  });

  it("counts commits on the branch after the agent's tip as the reviewer's lines", async () => {
    const repo = await gitRepo();
    const base = await headOf(repo);
    await git(repo, ["switch", "-c", "agn/task"]);
    await commitLines(repo, "agent.txt", 10, NOW);
    await commitLines(repo, "reviewer.txt", 5, LATER);
    await git(repo, ["switch", "main"]);

    const closedAt = "2026-09-12T10:30:00.000Z";
    const at = task({ branch: "agn/task", baseCommit: base });
    const facts = await readBranchFacts(repo, at, closedAt);
    const verdict = await detectVerdict(repo, "main", at, facts);
    expect(verdict.humanChangedLines).toBe(5);
    // Nobody has merged this branch: reviewing it is not the same as accepting it.
    expect(verdict.accepted).toBe(false);
  });

  it("says neither for a task with no branch or no recorded base", async () => {
    const repo = await gitRepo();
    const facts: BranchFacts = {
      agentTip: null,
      agentLines: null,
      branchExists: false,
      worktreeExists: false,
    };
    expect(await detectVerdict(repo, "main", task(), facts)).toEqual({
      accepted: false,
      reverted: false,
      humanChangedLines: null,
    });
    const noBase = task({ branch: "agn/task" });
    expect(await detectVerdict(repo, "main", noBase, facts)).toEqual({
      accepted: false,
      reverted: false,
      humanChangedLines: null,
    });
  });
});
