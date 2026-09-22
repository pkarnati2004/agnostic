import { describe, expect, it } from "vitest";
import { ApiError } from "../api/error";
import { changesResponse, FILES } from "./changes-fixture";
import { changesReducer, IDLE_CHANGES, selectedAfterLoad } from "./changes-state";

const REFUSED = new ApiError("the branch agn/invite-links-a1b2 no longer exists", {
  code: "branch-gone",
  status: 409,
});

function ready() {
  return changesReducer(IDLE_CHANGES, { type: "loaded", response: changesResponse(), at: 5 });
}

describe("changesReducer", () => {
  it("keeps the list a refresh is replacing", () => {
    const loading = changesReducer(ready(), { type: "fetch" });
    expect(loading).toEqual({ kind: "loading", previous: changesResponse() });
  });

  it("keeps the list behind a failure", () => {
    const failed = changesReducer(ready(), { type: "failed", error: REFUSED });
    expect(failed).toEqual({ kind: "error", error: REFUSED, previous: changesResponse() });
  });

  it("drops everything when the panel moves to another task", () => {
    expect(changesReducer(ready(), { type: "reset" })).toBe(IDLE_CHANGES);
  });
});

describe("selectedAfterLoad", () => {
  it("stays on the file being read while it is still listed", () => {
    expect(selectedAfterLoad("src/invite.test.ts", FILES)).toBe("src/invite.test.ts");
  });

  it("moves to the first row when the file is no longer changed", () => {
    expect(selectedAfterLoad("src/gone.ts", FILES)).toBe("src/invite.ts");
  });

  it("selects nothing when nothing changed", () => {
    expect(selectedAfterLoad("src/invite.ts", [])).toBeNull();
  });
});
