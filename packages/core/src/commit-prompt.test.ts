import { describe, expect, it } from "vitest";
import { commitPrompt, defaultCommitPrompt } from "./commit-prompt.js";

describe("commitPrompt", () => {
  it("asks for a commit on the branch by name when the repo has no file", () => {
    const prompt = commitPrompt({ branch: "agn/invite-links", file: null });
    expect(prompt).toContain("Commit your work on `agn/invite-links`.");
    expect(prompt).toContain("Do not push.");
    expect(prompt.endsWith("run that instead.")).toBe(true);
    expect(prompt).toBe(defaultCommitPrompt("agn/invite-links"));
  });

  it("sends the repo's file as written, with no branch of its own filled in", () => {
    const file = "Run `/land`. It commits and opens the PR.\n\n";
    expect(commitPrompt({ branch: "agn/invite-links", file })).toBe(
      "Run `/land`. It commits and opens the PR.",
    );
  });

  it("falls back to the default for a file that holds nothing but whitespace", () => {
    const branch = "agn/invite-links";
    expect(commitPrompt({ branch, file: "" })).toBe(defaultCommitPrompt(branch));
    expect(commitPrompt({ branch, file: "\n  \n" })).toBe(defaultCommitPrompt(branch));
  });

  it("keeps a CRLF body as written, trimming only the ends", () => {
    const file = "\r\nRun `/land`.\r\nDo not push.\r\n\r\n";
    expect(commitPrompt({ branch: "agn/invite-links", file })).toBe("Run `/land`.\r\nDo not push.");
  });

  it("sends a file with its own Commit heading verbatim, with no heading logic of its own", () => {
    const file = "## Commit\n\nRun `/land`. It commits and opens the PR.\n";
    const prompt = commitPrompt({ branch: "agn/invite-links", file });
    expect(prompt).toBe("## Commit\n\nRun `/land`. It commits and opens the PR.");
    expect(prompt.match(/## Commit/g)).toHaveLength(1);
  });
});
