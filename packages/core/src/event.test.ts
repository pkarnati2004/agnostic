import { describe, expect, it } from "vitest";
import { type Event, type EventInput, EventInputSchema, EventSchema } from "./event.js";

const statusInput: EventInput<"task.status"> = {
  ts: "2026-09-10T12:31:00.000Z",
  taskId: "t3n9v2wxyz",
  repoId: "r7k2m4pqrs",
  kind: "task.status",
  payload: { from: "queued", to: "running" },
};

const usageInput: EventInput<"usage.recorded"> = {
  ts: "2026-09-10T12:40:00.000Z",
  taskId: "t3n9v2wxyz",
  kind: "usage.recorded",
  payload: { tokens: 143_000, costUsd: null, source: "transcript" },
};

describe("EventInputSchema", () => {
  it("parses each kind with its own payload", () => {
    expect(EventInputSchema.parse(statusInput)).toEqual(statusInput);
    expect(EventInputSchema.parse(usageInput)).toEqual(usageInput);
  });

  it("rejects a payload that belongs to another kind", () => {
    const crossed = { ...statusInput, payload: usageInput.payload };
    expect(EventInputSchema.safeParse(crossed).success).toBe(false);
  });

  it("rejects an unknown kind, a bad timestamp and a non-id task", () => {
    expect(EventInputSchema.safeParse({ ...statusInput, kind: "task.exploded" }).success).toBe(
      false,
    );
    expect(EventInputSchema.safeParse({ ...statusInput, ts: "yesterday" }).success).toBe(false);
    expect(EventInputSchema.safeParse({ ...statusInput, taskId: "nope" }).success).toBe(false);
  });

  it("does not require taskId or repoId", () => {
    const detected = {
      ts: "2026-09-10T12:00:00.000Z",
      kind: "profile.detected",
      payload: {
        profile: {
          id: "codex:gpt-5:native",
          harness: "codex",
          model: "gpt-5",
          route: "native",
          billing: "api-key",
          available: true,
          evidence: "binary",
          tier: 1,
        },
      },
    };
    expect(EventInputSchema.parse(detected)).toEqual(detected);
  });
});

describe("EventSchema", () => {
  it("parses a ledger row and keeps its id", () => {
    const row = { ...statusInput, id: 42 };
    const parsed: Event = EventSchema.parse(row);
    expect(parsed).toEqual(row);
  });

  it("rejects a row without an id or with a non-integer id", () => {
    expect(EventSchema.safeParse(statusInput).success).toBe(false);
    expect(EventSchema.safeParse({ ...statusInput, id: 1.5 }).success).toBe(false);
  });

  it("rejects a ledger row whose payload belongs to another kind", () => {
    const crossed = { ...statusInput, id: 42, payload: usageInput.payload };
    expect(EventSchema.safeParse(crossed).success).toBe(false);
  });
});
