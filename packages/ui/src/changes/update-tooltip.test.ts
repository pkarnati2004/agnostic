import { describe, expect, it } from "vitest";
import { updateTooltip } from "./update-tooltip";

describe("updateTooltip", () => {
  it("rebases a branch that was never pushed", () => {
    expect(updateTooltip("agn/invite-links-a1b2", "main", false)).toBe(
      "Resume the agent in this worktree with a prompt to bring `agn/invite-links-a1b2` up to " +
        "date with `main`, resolve conflicts and keep tests green: rebase because the branch was " +
        "never pushed. agn runs no git command itself.",
    );
  });

  it("merges into a branch that was pushed", () => {
    expect(updateTooltip("agn/invite-links-a1b2", "main", true)).toBe(
      "Resume the agent in this worktree with a prompt to bring `agn/invite-links-a1b2` up to " +
        "date with `main`, resolve conflicts and keep tests green: merge from the base because " +
        "it was pushed. agn runs no git command itself.",
    );
  });
});
