import { describe, expect, it } from "vitest";
import { COMMIT_PROMPT_PATHS, commitPrompt, defaultCommitPrompt } from "./commit-prompt.js";

describe("commitPrompt", () => {
  it("asks for a commit on the branch by name when the repo has no file", () => {
    const prompt = commitPrompt({ branch: "agn/invite-links", file: null, paths: [] });
    expect(prompt).toContain("Commit your work on `agn/invite-links`.");
    expect(prompt).toContain("Do not push.");
    expect(prompt.endsWith("run that instead.")).toBe(true);
    expect(prompt).toBe(defaultCommitPrompt("agn/invite-links", []));
  });

  it("sends the repo's file as written, with no branch of its own filled in", () => {
    const file = "Run `/land`. It commits and opens the PR.\n\n";
    expect(commitPrompt({ branch: "agn/invite-links", file, paths: [] })).toBe(
      "Run `/land`. It commits and opens the PR.",
    );
  });

  it("falls back to the default for a file that holds nothing but whitespace", () => {
    const branch = "agn/invite-links";
    expect(commitPrompt({ branch, file: "", paths: [] })).toBe(defaultCommitPrompt(branch, []));
    expect(commitPrompt({ branch, file: "\n  \n", paths: [] })).toBe(
      defaultCommitPrompt(branch, []),
    );
  });

  it("keeps a CRLF body as written, trimming only the ends", () => {
    const file = "\r\nRun `/land`.\r\nDo not push.\r\n\r\n";
    expect(commitPrompt({ branch: "agn/invite-links", file, paths: [] })).toBe(
      "Run `/land`.\r\nDo not push.",
    );
  });

  it("sends a file with its own Commit heading verbatim, with no heading logic of its own", () => {
    const file = "## Commit\n\nRun `/land`. It commits and opens the PR.\n";
    const prompt = commitPrompt({ branch: "agn/invite-links", file, paths: [] });
    expect(prompt).toBe("## Commit\n\nRun `/land`. It commits and opens the PR.");
    expect(prompt.match(/## Commit/g)).toHaveLength(1);
  });

  it("keeps the launch form's wording when no path is given", () => {
    expect(defaultCommitPrompt("agn/x", [])).toBe(
      "Commit your work on `agn/x`. Stage every change this task made and commit it. " +
        "Write the message as one line that says what changed, and add a short body when the " +
        "reason is not obvious from the diff. Do not push. If this repo has its own commit or " +
        "land command, run that instead.",
    );
  });

  it("names the uncommitted paths, backticked and comma-separated", () => {
    const prompt = commitPrompt({ branch: "agn/x", file: null, paths: ["a.ts", "b.ts", "c.ts"] });
    expect(
      prompt.startsWith("Commit the uncommitted changes on `agn/x`: `a.ts`, `b.ts`, `c.ts`. "),
    ).toBe(true);
    expect(
      prompt.endsWith(
        "Do not push. If this repo has its own commit or land command, run that instead.",
      ),
    ).toBe(true);
  });

  it("names the first 20 paths and counts the rest", () => {
    const paths = Array.from({ length: 25 }, (_, at) => `f${at}.ts`);
    const prompt = defaultCommitPrompt("agn/x", paths);
    expect(COMMIT_PROMPT_PATHS).toBe(20);
    expect(prompt).toContain("`f19.ts` and 5 more.");
    expect(prompt).not.toContain("`f20.ts`");
  });

  it("sends the repo's file over either form", () => {
    expect(commitPrompt({ branch: "agn/x", file: "Run `/land`.", paths: ["a.ts"] })).toBe(
      "Run `/land`.",
    );
  });

  it("quotes a path holding a backtick or a newline as a JSON string", () => {
    const prompt = defaultCommitPrompt("agn/x", ["a`b.ts", "c\nd.ts", "e.ts"]);
    expect(prompt).toContain('"a`b.ts", "c\\nd.ts", `e.ts`.');
    expect(prompt).not.toContain("\n");
  });
});
