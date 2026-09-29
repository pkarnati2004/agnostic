import { describe, expect, it } from "vitest";
import { ApiError } from "../api/error";
import { compareResponse } from "./compare-fixture";
import { type CompareState, compareReducer, IDLE_COMPARE, lastCompare } from "./compare-state";

const RESPONSE = compareResponse();
const FAILURE = new ApiError("the compare is gone", { code: "compare-not-found", status: 404 });

const READY: CompareState = { kind: "ready", response: RESPONSE, fetchedAt: 1 };

describe("compareReducer", () => {
  it("starts idle with nothing to show", () => {
    expect(lastCompare(IDLE_COMPARE)).toBeNull();
    expect(compareReducer(IDLE_COMPARE, { type: "fetch" })).toEqual({
      kind: "loading",
      previous: null,
    });
  });

  it("keeps the columns already drawn while the next read runs", () => {
    expect(compareReducer(READY, { type: "fetch" })).toEqual({
      kind: "loading",
      previous: RESPONSE,
    });
  });

  it("keeps them through a failure too, so a refresh never blanks the view", () => {
    const failed = compareReducer(READY, { type: "failed", error: FAILURE });
    expect(failed).toEqual({ kind: "error", error: FAILURE, previous: RESPONSE });
    expect(lastCompare(failed)).toBe(RESPONSE);
    expect(compareReducer(failed, { type: "fetch" })).toEqual({
      kind: "loading",
      previous: RESPONSE,
    });
  });

  it("replaces everything with the body that arrived", () => {
    const next = compareResponse({ pickedTaskId: "task1" });
    expect(compareReducer(READY, { type: "loaded", response: next, at: 2 })).toEqual({
      kind: "ready",
      response: next,
      fetchedAt: 2,
    });
  });

  it("drops what it holds when the view is about another compare", () => {
    expect(compareReducer(READY, { type: "reset" })).toBe(IDLE_COMPARE);
  });
});
