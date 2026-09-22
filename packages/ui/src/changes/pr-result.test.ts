import type { CreatePrResponse } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { taskRow } from "./changes-fixture";
import { prOutcome } from "./pr-result";

function response(over: Partial<CreatePrResponse> = {}): CreatePrResponse {
  return {
    task: taskRow(),
    url: "https://github.com/agn/petal/pull/12",
    body: "## Spec\n\nwork",
    via: "gh",
    pushed: true,
    base: "main",
    branch: "agn/invite-links-a1b2",
    ...over,
  };
}

describe("prOutcome", () => {
  it("says the PR is open when gh made it", () => {
    expect(prOutcome(response(), true)).toEqual({
      line: "Pull request opened.",
      detail: "Description copied to the clipboard.",
    });
  });

  it("says where to paste the description when the clipboard refused", () => {
    expect(prOutcome(response(), false).detail).toBe("Copy the description below.");
  });

  it("sends the reader to the compare page when there is no gh", () => {
    expect(prOutcome(response({ via: "compare" }), true).line).toBe(
      "GitHub's compare page is open; paste the description and create the PR.",
    );
  });

  it("says when the branch was already on origin", () => {
    expect(prOutcome(response({ pushed: false }), true).detail).toBe(
      "Description copied to the clipboard. The branch was already on origin.",
    );
  });
});
