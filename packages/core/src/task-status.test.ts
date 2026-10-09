import { describe, expect, it } from "vitest";
import { TaskStatusSchema } from "./task.js";
import { CLOSED_STATUSES, isClosed, isLive, LIVE_STATUSES, TASK_STATUSES } from "./task-status.js";

describe("task statuses", () => {
  it("is the list the schema accepts", () => {
    expect(TaskStatusSchema.options).toEqual([...TASK_STATUSES]);
  });

  it("splits every status into live, closed, or queued", () => {
    const live = TASK_STATUSES.filter(isLive);
    const closed = TASK_STATUSES.filter(isClosed);
    expect(live).toEqual([...LIVE_STATUSES]);
    expect(closed).toEqual([...CLOSED_STATUSES]);
    expect(TASK_STATUSES.filter((s) => !isLive(s) && !isClosed(s))).toEqual(["queued"]);
  });

  it("calls a queued task neither live nor closed: it has no session and has not finished", () => {
    expect(isLive("queued")).toBe(false);
    expect(isClosed("queued")).toBe(false);
  });
});
