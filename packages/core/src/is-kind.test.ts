import { describe, expect, it } from "vitest";
import type { Event } from "./event.js";
import { isKind } from "./is-kind.js";

const STATUS: Event = {
  id: 7,
  ts: "2026-01-01T00:00:00.000Z",
  taskId: "task1",
  kind: "task.status",
  payload: { from: "running", to: "done" },
};

describe("isKind", () => {
  it("narrows an event to the payload of the kind read", () => {
    if (!isKind(STATUS, "task.status")) {
      throw new Error("task.status should match its own kind");
    }
    expect(STATUS.payload.to).toBe("done");
  });

  it("rejects every other kind", () => {
    expect(isKind(STATUS, "task.created")).toBe(false);
  });
});
