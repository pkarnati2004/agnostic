import { formatProfileId, type HarnessId, type Profile } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { launchSpec, resumeSpec } from "./launch.js";

function profile(harness: HarnessId): Profile {
  return {
    id: formatProfileId(harness, null, "native"),
    harness,
    model: null,
    route: "native",
    billing: "unknown",
    available: true,
    evidence: "binary",
    tier: 1,
  };
}

describe("Codex directory trust", () => {
  const worktree = "/Users/x/.agnostic/worktrees/repo/task";

  it("trusts the worktree agn made for the launch", () => {
    expect(
      launchSpec(profile("codex"), {
        prompt: "go",
        env: {},
        worktreePath: worktree,
      }).args,
    ).toEqual(["-c", `projects."${worktree}".trust_level="trusted"`, "go"]);
  });

  it("adds nothing for a task that runs in the checkout itself", () => {
    expect(
      launchSpec(profile("codex"), { prompt: "go", env: {}, worktreePath: null }).args,
    ).toEqual(["go"]);
    expect(launchSpec(profile("codex"), { prompt: "go", env: {} }).args).toEqual(["go"]);
  });

  it("repeats the override on a resume, which relaunches the harness", () => {
    expect(resumeSpec(profile("codex"), "abc", {}, worktree).args).toEqual([
      "-c",
      `projects."${worktree}".trust_level="trusted"`,
      "resume",
      "abc",
    ]);
  });

  it("leaves every other harness alone", () => {
    expect(
      launchSpec(profile("claude-code"), {
        prompt: "go",
        env: {},
        worktreePath: worktree,
      }).args,
    ).toEqual(["go"]);
    expect(resumeSpec(profile("claude-code"), "abc", {}, worktree).args).toEqual([
      "--resume",
      "abc",
    ]);
  });

  it("skips a path no TOML key can hold rather than writing a broken override", () => {
    for (const path of ['/tmp/we"ird', "/tmp/back\\slash", "relative/path"]) {
      expect(
        launchSpec(profile("codex"), { prompt: "go", env: {}, worktreePath: path }).args,
      ).toEqual(["go"]);
    }
  });
});
