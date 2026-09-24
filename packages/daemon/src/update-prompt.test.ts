import { describe, expect, it } from "vitest";
import { updatePrompt } from "./update-prompt.js";

const BASE = { baseRef: "main", branch: "agn/invite-links-a1b2", testCommand: "pnpm test" };

describe("updatePrompt", () => {
  it("asks for a rebase and says why, with the repo's test command", () => {
    expect(updatePrompt({ ...BASE, mode: "rebase" })).toBe(
      "Fetch `main`. Bring `agn/invite-links-a1b2` up to date with it by rebasing onto it " +
        "(this branch was never pushed). Resolve conflicts. Run `pnpm test` and keep it green. " +
        "Do not push.",
    );
  });

  it("asks for a merge once the branch has been pushed", () => {
    expect(updatePrompt({ ...BASE, mode: "merge" })).toBe(
      "Fetch `main`. Bring `agn/invite-links-a1b2` up to date with it by merging it in " +
        "(this branch was pushed). Resolve conflicts. Run `pnpm test` and keep it green. " +
        "Do not push.",
    );
  });

  it("names no command in a repo that has none, and still asks for green tests", () => {
    const prompt = updatePrompt({ ...BASE, mode: "rebase", testCommand: null });
    expect(prompt).toContain("Resolve conflicts. Keep the tests green. Do not push.");
    expect(prompt).not.toContain("Run ``");
  });
});
