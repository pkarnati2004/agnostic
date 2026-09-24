import { describe, expect, it } from "vitest";
import { composeLaunchPrompt, type LaunchPromptInput, outcomeLine } from "./launch-prompt.js";
import type { Outcome } from "./outcome.js";
import type { Task } from "./task.js";
import type { TaskNote } from "./task-note.js";

const NOW = "2026-09-11T10:00:00.000Z";

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    repoId: "repoaaaaaa",
    title: `task ${id}`,
    prompt: "do the thing",
    profileId: "claude-code:default:native",
    worktreePath: `/w/${id}`,
    branch: `agn/task-${id}`,
    status: "running",
    origin: "agn",
    baseCommit: null,
    compareId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function note(over: Partial<TaskNote> = {}): TaskNote {
  return {
    id: "aaaaaaaaaa",
    title: "task aaaaaaaaaa",
    status: "queued",
    profileId: "claude-code:default:native",
    createdAt: NOW,
    parentTaskId: null,
    spec: "add a --verbose flag",
    acceptance: null,
    notes: null,
    handoffs: [],
    ...over,
  };
}

function outcome(over: Partial<Outcome> = {}): Outcome {
  return {
    taskId: "bbbbbbbbbb",
    testsBefore: null,
    testsAfter: null,
    accepted: null,
    reverted: null,
    agentLines: null,
    humanChangedLines: null,
    humanEditRatio: null,
    durationSec: 60,
    costUsd: null,
    tokens: 100,
    resolvedModel: null,
    ...over,
  };
}

function input(over: Partial<LaunchPromptInput> = {}): LaunchPromptInput {
  return {
    task: task("aaaaaaaaaa"),
    note: note(),
    done: [],
    inFlight: [],
    decisions: null,
    handoff: null,
    commit: null,
    ...over,
  };
}

describe("composeLaunchPrompt", () => {
  it("names the task and its spec", () => {
    expect(composeLaunchPrompt(input())).toBe(
      "# Task aaaaaaaaaa: task aaaaaaaaaa\n\n## Spec\n\nadd a --verbose flag\n",
    );
  });

  it("omits Repo state when there is no done, in-flight or decision line", () => {
    expect(composeLaunchPrompt(input())).not.toContain("## Repo state");
  });

  it("includes acceptance only when the note has one", () => {
    const prompt = composeLaunchPrompt(input({ note: note({ acceptance: "the tests pass" }) }));
    expect(prompt).toContain("## Acceptance\n\nthe tests pass");
  });

  it("lists at most five done tasks, newest first, with their outcome", () => {
    const done = [1, 2, 3, 4, 5, 6].map((n) => ({
      task: task(`bbbbbbbbb${n}`, { title: `done ${n}` }),
      outcome: outcome({ accepted: true, testsAfter: true, humanEditRatio: 0.12 }),
    }));
    const prompt = composeLaunchPrompt(input({ done }));
    expect(prompt).toContain(
      "Done recently:\n- done 1 (agn/task-bbbbbbbbb1): accepted, tests pass, human edits 12%",
    );
    expect(prompt).not.toContain("done 6");
  });

  it("says in place for a folder task and keeps the profile on in-flight lines", () => {
    const prompt = composeLaunchPrompt(
      input({
        inFlight: [task("ccccccccc1", { title: "the other one", branch: null })],
        done: [{ task: task("ddddddddd1", { title: "old", branch: null }), outcome: null }],
      }),
    );
    expect(prompt).toContain("In flight:\n- the other one (in place, claude-code:default:native)");
    expect(prompt).toContain("Done recently:\n- old (in place): no outcome recorded");
  });

  it("takes the last five non-blank decision lines", () => {
    const decisions = ["one", "", "two", "three", "four", "five", "six  "].join("\n");
    const prompt = composeLaunchPrompt(input({ decisions }));
    expect(prompt).toContain("Recent decisions:\n- two\n- three\n- four\n- five\n- six");
    expect(prompt).not.toContain("- one");
  });

  it("adds the handoff section when the task has a parent", () => {
    const prompt = composeLaunchPrompt(
      input({
        task: task("aaaaaaaaaa", { parentTaskId: "eeeeeeeeee" }),
        handoff: { toProfileId: "codex:default:native", at: NOW, body: "what is left" },
      }),
    );
    expect(prompt).toContain("## Handoff from eeeeeeeeee\n\nwhat is left");
  });

  it("ends with Before you finish, verbatim, when the launch carries a commit prompt", () => {
    const prompt = composeLaunchPrompt(input({ commit: "Commit on `agn/x`. Do not push." }));
    expect(prompt.endsWith("## Before you finish\n\nCommit on `agn/x`. Do not push.\n")).toBe(true);
  });

  it("leaves the section out for a task with no branch of agn's", () => {
    expect(composeLaunchPrompt(input())).not.toContain("Before you finish");
  });

  it("never carries the project instructions", () => {
    const prompt = composeLaunchPrompt(input({ decisions: "a decision" }));
    expect(prompt).not.toContain("instructions");
  });

  it("orders every section the same way, and reproduces the same string twice", () => {
    const full = input({
      note: note({ acceptance: "the tests pass" }),
      task: task("aaaaaaaaaa", { parentTaskId: "eeeeeeeeee" }),
      done: [{ task: task("bbbbbbbbb1", { title: "done one" }), outcome: null }],
      inFlight: [task("ccccccccc1", { title: "in flight one" })],
      decisions: "a decision",
      handoff: { toProfileId: "codex:default:native", at: NOW, body: "what is left" },
      commit: "Commit on `agn/task-aaaaaaaaaa`.",
    });
    const prompt = composeLaunchPrompt(full);
    const headings = [
      "# Task aaaaaaaaaa",
      "## Spec",
      "## Acceptance",
      "## Repo state",
      "Done recently:",
      "In flight:",
      "Recent decisions:",
      "## Handoff from eeeeeeeeee",
      "## Before you finish",
    ];
    let cursor = -1;
    for (const heading of headings) {
      const at = prompt.indexOf(heading);
      expect(at, `${heading} is present`).toBeGreaterThan(-1);
      expect(at, `${heading} comes after the previous section`).toBeGreaterThan(cursor);
      cursor = at;
    }
    expect(composeLaunchPrompt(full)).toBe(prompt);
  });
});

describe("outcomeLine", () => {
  it("reports a missing outcome", () => {
    expect(outcomeLine(null)).toBe("no outcome recorded");
  });

  it("reads accepted, reverted and neither", () => {
    expect(outcomeLine(outcome({ accepted: true }))).toBe("accepted");
    expect(outcomeLine(outcome({ reverted: true }))).toBe("reverted");
    expect(outcomeLine(outcome())).toBe("not merged");
  });

  it("adds the test result and the human edit share when they are known", () => {
    expect(outcomeLine(outcome({ accepted: true, testsAfter: false }))).toBe(
      "accepted, tests fail",
    );
    expect(outcomeLine(outcome({ reverted: true, humanEditRatio: 0.125 }))).toBe(
      "reverted, human edits 13%",
    );
  });
});
