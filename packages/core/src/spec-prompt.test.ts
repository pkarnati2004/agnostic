import { describe, expect, it } from "vitest";
import type { RepoStateInput } from "./launch-prompt.js";
import { composeSpecPrompt } from "./spec-prompt.js";
import type { Task } from "./task.js";

const NOW = "2026-09-14T10:00:00.000Z";

const EMPTY: RepoStateInput = { done: [], inFlight: [], decisions: null };

const SHAPE = `Answer in markdown and nothing else, in exactly this shape:

# <a title of at most 80 characters>

## Spec

What to change and where, as plain statements. Name files and commands where you can. Do not repeat the project instructions.

## Acceptance

A checklist, one \`- [ ]\` line per criterion, each one checkable by running or reading something.

Do not edit any file. Do not run the tests.
`;

function task(id: string, title: string): Task {
  return {
    id,
    repoId: "repoaaaaaa",
    title,
    prompt: "do the thing",
    profileId: "claude-code:default:native",
    worktreePath: `/w/${id}`,
    branch: `agn/task-${id}`,
    status: "running",
    origin: "agn",
    baseCommit: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("composeSpecPrompt", () => {
  it("asks for the three sections from the one-liner alone", () => {
    expect(
      composeSpecPrompt({ prompt: "add a --verbose flag", intent: null, repoState: EMPTY }),
    ).toBe(`Write a task spec for this repository.

Task: add a --verbose flag

${SHAPE}`);
  });

  it("names the intent when the caller gave one", () => {
    const prompt = composeSpecPrompt({
      prompt: "the auth test flakes",
      intent: "debug",
      repoState: EMPTY,
    });
    expect(prompt).toContain("Task: the auth test flakes\nIntent: debug\n");
  });

  it("carries the same repo state block a launch would", () => {
    const prompt = composeSpecPrompt({
      prompt: "add a --verbose flag",
      intent: null,
      repoState: {
        done: [{ task: task("bbbbbbbbbb", "ship the parser"), outcome: null }],
        inFlight: [task("cccccccccc", "rewrite the printer")],
        decisions: "settled on yaml\n",
      },
    });
    expect(prompt).toContain("## Repo state");
    expect(prompt).toContain("- ship the parser (agn/task-bbbbbbbbbb): no outcome recorded");
    expect(prompt).toContain(
      "- rewrite the printer (agn/task-cccccccccc, claude-code:default:native)",
    );
    expect(prompt).toContain("- settled on yaml");
    // The block sits between the task and the shape, so the model reads the state before the rules.
    expect(prompt.indexOf("## Repo state")).toBeLessThan(prompt.indexOf("Answer in markdown"));
  });

  it("leaves the block out when the repo has no state to report", () => {
    expect(
      composeSpecPrompt({ prompt: "add a flag", intent: "implement", repoState: EMPTY }),
    ).not.toContain("Repo state");
  });
});
