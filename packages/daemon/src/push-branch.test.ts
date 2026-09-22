import { CoreError } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pushBranch } from "./push-branch.js";
import { type GitRecorder, recordGit } from "./test-git-recorder.js";

const BRANCH = "agn/invite-links-a1b2";
const CWD = "/work/repo";

/** The daemon's env, which is where the push finds git and git finds its credential helpers. */
function env(): Record<string, string> {
  return { PATH: process.env.PATH ?? "", HOME: "/home/agn" };
}

let git: GitRecorder;

beforeEach(async () => {
  git = await recordGit();
});

afterEach(() => git.restore());

async function refusal(): Promise<CoreError> {
  try {
    await pushBranch(CWD, BRANCH, true, env());
  } catch (cause) {
    if (cause instanceof CoreError) {
      return cause;
    }
  }
  throw new Error("the push was not refused");
}

describe("pushBranch", () => {
  it("pushes to origin with --set-upstream only when the branch has none", async () => {
    await pushBranch(CWD, BRANCH, false, env());
    await pushBranch(CWD, BRANCH, true, env());
    expect(await git.calls()).toEqual([
      ["-C", CWD, "push", "--porcelain", "--set-upstream", "origin", BRANCH],
      ["-C", CWD, "push", "--porcelain", "origin", BRANCH],
    ]);
  });

  it("tells git not to ask for a password: nobody is at the daemon's terminal", async () => {
    await pushBranch(CWD, BRANCH, true, env());
    expect(await git.terminalPrompt()).toBe("0");
  });

  it("reads a new branch and a fast-forward as pushed, and an up-to-date ref as not", async () => {
    git.answerPush({ stdout: `To origin\n*\trefs/heads/x:refs/heads/x\t[new branch]\nDone\n` });
    expect(await pushBranch(CWD, BRANCH, false, env())).toEqual({ pushed: true });
    git.answerPush({ stdout: `To origin\n \trefs/heads/x:refs/heads/x\t\nDone\n` });
    expect(await pushBranch(CWD, BRANCH, true, env())).toEqual({ pushed: true });
    git.answerPush({ stdout: `To origin\n=\trefs/heads/x:refs/heads/x\t[up to date]\nDone\n` });
    expect(await pushBranch(CWD, BRANCH, true, env())).toEqual({ pushed: false });
  });

  it("says to bring the branch up to date when the remote is ahead", async () => {
    git.answerPush({
      exitCode: 1,
      stdout: `To origin\n!\trefs/heads/x:refs/heads/x\t[rejected] (fetch first)\nDone\n`,
      stderr: "error: failed to push some refs to 'origin'\n",
    });
    const error = await refusal();
    expect(error.code).toBe("push-rejected");
    expect(error.message).toContain(`git refused to push ${BRANCH}`);
    expect(error.hint).toContain("agn update");
  });

  it("hands back git's own words when the push failed for another reason", async () => {
    git.answerPush({ exitCode: 128, stderr: "could not read from remote repository\n" });
    const error = await refusal();
    expect(error.code).toBe("push-rejected");
    expect(error.message).toContain("could not read from remote repository");
    expect(error.hint).toBe(`Run \`git push\` in ${CWD} to see git's answer.`);
  });

  it("never forces a push, whatever git answered", async () => {
    await pushBranch(CWD, BRANCH, false, env());
    git.answerPush({ exitCode: 1, stdout: `!\trefs/heads/x:refs/heads/x\t[rejected]\n` });
    await refusal();
    const flat = (await git.calls()).flat();
    expect(flat).not.toContain("--force");
    expect(flat).not.toContain("-f");
    expect(flat).not.toContain("--force-with-lease");
  });
});
