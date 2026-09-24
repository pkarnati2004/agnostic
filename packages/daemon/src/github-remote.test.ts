import { describe, expect, it } from "vitest";
import { compareUrl, parseGithubRemote } from "./github-remote.js";

describe("parseGithubRemote", () => {
  it("reads the three forms git writes, with and without .git", () => {
    const forms = [
      "https://github.com/agn/petal.git",
      "https://github.com/agn/petal",
      "git@github.com:agn/petal.git",
      "git@github.com:agn/petal",
      "ssh://git@github.com/agn/petal.git",
      "ssh://git@github.com/agn/petal",
    ];
    for (const url of forms) {
      expect(parseGithubRemote(url)).toEqual({ owner: "agn", repo: "petal" });
    }
  });

  it("answers null for a remote that is not GitHub", () => {
    expect(parseGithubRemote("https://gitlab.com/agn/petal.git")).toBeNull();
    expect(parseGithubRemote("git@gitlab.com:agn/petal.git")).toBeNull();
    expect(parseGithubRemote("/tmp/origin.git")).toBeNull();
    expect(parseGithubRemote("")).toBeNull();
  });
});

describe("compareUrl", () => {
  it("encodes the title and leaves the refs as git names them", () => {
    const url = compareUrl({ owner: "agn", repo: "petal" }, "main", "agn/x-id", "a & b");
    expect(url).toBe(
      "https://github.com/agn/petal/compare/main...agn/x-id?expand=1&title=a%20%26%20b",
    );
  });

  it("encodes a title with an ampersand, a hash and a space together", () => {
    const url = compareUrl(
      { owner: "agn", repo: "petal" },
      "main",
      "agn/x-id",
      "Fix bug #123 & polish",
    );
    expect(url).toBe(
      "https://github.com/agn/petal/compare/main...agn/x-id?expand=1&title=Fix%20bug%20%23123%20%26%20polish",
    );
  });
});
