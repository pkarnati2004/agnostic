import { describe, expect, it } from "vitest";
import { ApiError } from "../api/error";
import { type RepoNotice, repoNoticeLine } from "./repo-notices";

function notice(over: Partial<RepoNotice> = {}): RepoNotice {
  return {
    action: "close",
    error: new ApiError("repo petal has a task that is still running", {
      code: "repo-busy",
      hint: "Run `agn stop task1` first.",
      status: 409,
    }),
    at: 1000,
    ...over,
  };
}

describe("repoNoticeLine", () => {
  it("names the action, the repo and what the daemon said", () => {
    expect(repoNoticeLine(notice(), { name: "petal" })).toBe(
      "Close failed for petal: repo petal has a task that is still running",
    );
  });

  it("says Reopen the way the button does", () => {
    expect(repoNoticeLine(notice({ action: "reopen" }), { name: "katha" })).toContain(
      "Reopen failed for katha",
    );
  });
});
