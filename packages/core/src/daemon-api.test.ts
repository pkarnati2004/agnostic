import { describe, expect, it } from "vitest";
import {
  ApiErrorBodySchema,
  DaemonInfoSchema,
  EventsQuerySchema,
  HealthResponseSchema,
  RegisterRepoRequestSchema,
  TaskListQuerySchema,
} from "./daemon-api.js";

describe("ApiErrorBodySchema", () => {
  it("accepts an error with a hint and one without", () => {
    expect(
      ApiErrorBodySchema.safeParse({ error: { code: "repo-not-found", message: "no repo" } })
        .success,
    ).toBe(true);
    expect(
      ApiErrorBodySchema.safeParse({
        error: { code: "ambiguous-id", message: "two match", hint: "abcdefghjk, mnpqrstuvw" },
      }).success,
    ).toBe(true);
  });

  it("rejects a body with no code", () => {
    expect(ApiErrorBodySchema.safeParse({ error: { message: "no code" } }).success).toBe(false);
  });
});

describe("DaemonInfoSchema", () => {
  const info = { pid: 4321, port: 7431, startedAt: "2026-09-11T10:00:00.000Z" };

  it("accepts what the daemon writes", () => {
    expect(DaemonInfoSchema.parse(info)).toEqual(info);
  });

  it("rejects a port outside the range and an extra field", () => {
    expect(DaemonInfoSchema.safeParse({ ...info, port: 99999 }).success).toBe(false);
    expect(DaemonInfoSchema.safeParse({ ...info, host: "0.0.0.0" }).success).toBe(false);
  });

  it("carries a version once it is a health response", () => {
    expect(HealthResponseSchema.safeParse(info).success).toBe(false);
    expect(HealthResponseSchema.parse({ ...info, version: "0.1.0" }).version).toBe("0.1.0");
  });
});

describe("RegisterRepoRequestSchema", () => {
  it("accepts a path alone and with its flags", () => {
    expect(RegisterRepoRequestSchema.parse({ path: "/code/alpha" })).toEqual({
      path: "/code/alpha",
    });
    expect(
      RegisterRepoRequestSchema.parse({ path: "/code/alpha", gitInit: true, newId: false }),
    ).toMatchObject({ gitInit: true, newId: false });
  });

  it("rejects an empty path, a missing path and a field it does not know", () => {
    expect(RegisterRepoRequestSchema.safeParse({ path: "" }).success).toBe(false);
    expect(RegisterRepoRequestSchema.safeParse({}).success).toBe(false);
    expect(
      RegisterRepoRequestSchema.safeParse({ path: "/code/alpha", branch: "main" }).success,
    ).toBe(false);
  });
});

describe("TaskListQuerySchema", () => {
  it("splits a comma-separated status list", () => {
    expect(TaskListQuerySchema.parse({ status: "running,waiting" })).toEqual({
      status: ["running", "waiting"],
    });
  });

  it("is empty when no status is given", () => {
    expect(TaskListQuerySchema.parse({})).toEqual({});
  });

  it("rejects a status that is not one", () => {
    expect(TaskListQuerySchema.safeParse({ status: "sideways" }).success).toBe(false);
  });
});

describe("EventsQuerySchema", () => {
  it("reads the cursor out of the query string", () => {
    expect(EventsQuerySchema.parse({ after: "42" })).toEqual({ after: 42 });
    expect(EventsQuerySchema.parse({})).toEqual({});
  });

  it("rejects a cursor that is not a whole number, and an unknown key", () => {
    expect(EventsQuerySchema.safeParse({ after: "half" }).success).toBe(false);
    expect(EventsQuerySchema.safeParse({ after: "-1" }).success).toBe(false);
    expect(EventsQuerySchema.safeParse({ since: "1" }).success).toBe(false);
  });
});
