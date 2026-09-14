import { describe, expect, it } from "vitest";
import { ApiError } from "../api/error";
import { usageResponse } from "./usage-response.fixture";
import { IDLE_USAGE, lastResponse, type UsageState, usageReducer } from "./usage-state";

const FAILURE = new ApiError("the scan failed", { code: "usage-failed", status: 500 });

function ready(): UsageState {
  return usageReducer(IDLE_USAGE, { type: "loaded", response: usageResponse(), at: 1_000 });
}

describe("usageReducer", () => {
  it("records when a body arrived", () => {
    expect(ready()).toMatchObject({ kind: "ready", fetchedAt: 1_000 });
  });

  it("keeps the last body while the next read is in flight", () => {
    const state = usageReducer(ready(), { type: "fetch" });
    expect(state).toMatchObject({ kind: "loading" });
    expect(lastResponse(state)).toEqual(usageResponse());
  });

  it("keeps the last body when a read fails, so the bar never blanks", () => {
    const state = usageReducer(ready(), { type: "failed", error: FAILURE });
    expect(state).toMatchObject({ kind: "error", error: FAILURE });
    expect(lastResponse(state)).toEqual(usageResponse());
  });

  it("has nothing to keep before the first read", () => {
    expect(lastResponse(usageReducer(IDLE_USAGE, { type: "fetch" }))).toBeNull();
    expect(lastResponse(usageReducer(IDLE_USAGE, { type: "failed", error: FAILURE }))).toBeNull();
  });

  it("replaces the body a later read returns", () => {
    const second = usageResponse([]);
    const state = usageReducer(ready(), { type: "loaded", response: second, at: 2_000 });
    expect(lastResponse(state)).toBe(second);
  });
});
