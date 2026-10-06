import { describe, expect, it } from "vitest";
import { type Event, type EventInput, EventInputSchema, EventSchema } from "./event.js";

const statusInput: EventInput<"task.status"> = {
  ts: "2026-09-10T12:31:00.000Z",
  taskId: "t3n9v2wxyz",
  repoId: "r7k2m4pqrs",
  kind: "task.status",
  payload: { from: "queued", to: "running" },
};

const repoInput: EventInput<"repo.registered"> = {
  ts: "2026-09-10T11:00:00.000Z",
  repoId: "r7k2m4pqrs",
  kind: "repo.registered",
  payload: {
    repo: {
      id: "r7k2m4pqrs",
      path: "/Users/dev/code/agnostic",
      kind: "git",
      name: "agnostic",
      addedAt: "2026-09-10T11:00:00.000Z",
      status: "active",
    },
  },
};

const sessionInput: EventInput<"session.captured"> = {
  ts: "2026-09-10T12:32:00.000Z",
  taskId: "t3n9v2wxyz",
  repoId: "r7k2m4pqrs",
  kind: "session.captured",
  payload: {
    session: {
      harness: "claude-code",
      sessionId: "b7d1f0e2",
      tmuxSession: "agn-t3n9v2wxyz",
      tmuxSocket: "agn",
      launchId: null,
      pid: null,
      cwd: "/Users/dev/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz",
      lastSeenAt: "2026-09-10T12:32:00.000Z",
    },
  },
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
    expect(EventInputSchema.parse(repoInput)).toEqual(repoInput);
    expect(EventInputSchema.parse(sessionInput)).toEqual(sessionInput);
  });

  it("parses the kinds the ledger has no row for", () => {
    const adopted: EventInput<"task.adopted"> = {
      ts: "2026-09-10T12:33:00.000Z",
      taskId: "t3n9v2wxyz",
      kind: "task.adopted",
      payload: { pid: 4211, cwd: "/Users/dev/code/agnostic" },
    };
    expect(EventInputSchema.parse(adopted)).toEqual(adopted);
    expect(EventInputSchema.safeParse({ ...adopted, payload: { pid: 0, cwd: "" } }).success).toBe(
      false,
    );
  });

  it("parses task.cleaned with the branch deleted and kept", () => {
    const cleaned: EventInput<"task.cleaned"> = {
      ts: "2026-09-10T12:34:00.000Z",
      taskId: "t3n9v2wxyz",
      repoId: "r7k2m4pqrs",
      kind: "task.cleaned",
      payload: { deletedBranch: true },
    };
    expect(EventInputSchema.parse(cleaned)).toEqual(cleaned);
    expect(EventInputSchema.parse({ ...cleaned, payload: { deletedBranch: false } })).toEqual({
      ...cleaned,
      payload: { deletedBranch: false },
    });
  });

  it("rejects task.cleaned with the wrong payload type", () => {
    const cleaned: EventInput<"task.cleaned"> = {
      ts: "2026-09-10T12:34:00.000Z",
      taskId: "t3n9v2wxyz",
      kind: "task.cleaned",
      payload: { deletedBranch: true },
    };
    expect(
      EventInputSchema.safeParse({ ...cleaned, payload: { deletedBranch: "yes" } }).success,
    ).toBe(false);
    expect(EventInputSchema.safeParse({ ...cleaned, payload: {} }).success).toBe(false);
  });

  it("parses task.deleted and rejects one with no removedWorktree", () => {
    const deleted: EventInput<"task.deleted"> = {
      ts: "2026-09-10T12:35:00.000Z",
      taskId: "t3n9v2wxyz",
      repoId: "r7k2m4pqrs",
      kind: "task.deleted",
      payload: { removedWorktree: true },
    };
    expect(EventInputSchema.parse(deleted)).toEqual(deleted);
    expect(EventInputSchema.safeParse({ ...deleted, payload: {} }).success).toBe(false);
  });

  it("tells repo.registered and repo.updated apart", () => {
    const updated = { ...repoInput, kind: "repo.updated" as const };
    expect(EventInputSchema.parse(updated)).toEqual(updated);
    expect(EventInputSchema.safeParse({ ...updated, payload: { repo: {} } }).success).toBe(false);
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

describe("plan.changed", () => {
  const changed: EventInput<"plan.changed"> = {
    ts: "2026-09-12T09:00:00.000Z",
    kind: "plan.changed",
    payload: { harness: "claude-code", from: "pro", to: "max20", source: "detected" },
  };

  it("carries the harness, both plans and where the new one came from", () => {
    expect(EventInputSchema.parse(changed)).toEqual(changed);
    // The first time agn learns a plan there is nothing to change from.
    const learned = { ...changed, payload: { ...changed.payload, from: null } };
    expect(EventInputSchema.parse(learned)).toEqual(learned);
  });

  it("refuses a source it does not know and a harness it cannot name", () => {
    expect(
      EventInputSchema.safeParse({
        ...changed,
        payload: { ...changed.payload, source: "guessed" },
      }).success,
    ).toBe(false);
    expect(
      EventInputSchema.safeParse({ ...changed, payload: { ...changed.payload, harness: "" } })
        .success,
    ).toBe(false);
  });
});
