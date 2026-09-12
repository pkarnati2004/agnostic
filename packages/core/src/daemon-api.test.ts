import { describe, expect, it } from "vitest";
import {
  ApiErrorBodySchema,
  CleanTaskRequestSchema,
  DaemonInfoSchema,
  EventsQuerySchema,
  HealthResponseSchema,
  HooksInstallRequestSchema,
  OpenTaskQuerySchema,
  RecommendRequestSchema,
  RegisterRepoRequestSchema,
  RunTaskRequestSchema,
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

describe("RunTaskRequestSchema", () => {
  it("accepts a bare prompt and every optional field together", () => {
    expect(RunTaskRequestSchema.parse({ prompt: "ship it" })).toEqual({ prompt: "ship it" });
    expect(
      RunTaskRequestSchema.parse({
        prompt: "ship it",
        title: "Ship it",
        profile: "claude-code:opus:native",
        model: "haiku",
        base: "main",
      }),
    ).toMatchObject({ title: "Ship it", profile: "claude-code:opus:native", model: "haiku" });
  });

  it("rejects an empty prompt and a missing prompt", () => {
    expect(RunTaskRequestSchema.safeParse({ prompt: "" }).success).toBe(false);
    expect(RunTaskRequestSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a field it does not know and the wrong type for a known one", () => {
    expect(RunTaskRequestSchema.safeParse({ prompt: "ship it", harness: "codex" }).success).toBe(
      false,
    );
    expect(RunTaskRequestSchema.safeParse({ prompt: "ship it", model: 5 }).success).toBe(false);
    expect(RunTaskRequestSchema.safeParse({ prompt: 5 }).success).toBe(false);
  });

  it("accepts --intent, replacing what the classifier would read out of the prompt", () => {
    expect(RunTaskRequestSchema.parse({ prompt: "ship it", intent: "debug" })).toMatchObject({
      intent: "debug",
    });
    expect(RunTaskRequestSchema.safeParse({ prompt: "ship it", intent: "vibes" }).success).toBe(
      false,
    );
  });
});

describe("RecommendRequestSchema", () => {
  it("accepts a bare prompt and every optional field together", () => {
    expect(
      RecommendRequestSchema.parse({ repoId: "r4k8m2qrst", prompt: "fix the flaky auth test" }),
    ).toEqual({ repoId: "r4k8m2qrst", prompt: "fix the flaky auth test" });
    expect(
      RecommendRequestSchema.parse({
        repoId: "r4k8m2qrst",
        prompt: "fix the flaky auth test",
        intent: "debug",
        subscriptionsOnly: true,
      }),
    ).toEqual({
      repoId: "r4k8m2qrst",
      prompt: "fix the flaky auth test",
      intent: "debug",
      subscriptionsOnly: true,
    });
  });

  it("rejects an empty prompt, a missing repoId and an intent it does not know", () => {
    expect(RecommendRequestSchema.safeParse({ repoId: "r4k8m2qrst", prompt: "" }).success).toBe(
      false,
    );
    expect(RecommendRequestSchema.safeParse({ prompt: "ship it" }).success).toBe(false);
    expect(
      RecommendRequestSchema.safeParse({
        repoId: "r4k8m2qrst",
        prompt: "ship it",
        intent: "vibes",
      }).success,
    ).toBe(false);
  });

  it("rejects a field it does not know and the wrong type for subscriptionsOnly", () => {
    expect(
      RecommendRequestSchema.safeParse({
        repoId: "r4k8m2qrst",
        prompt: "ship it",
        optimise: "quality",
      }).success,
    ).toBe(false);
    expect(
      RecommendRequestSchema.safeParse({
        repoId: "r4k8m2qrst",
        prompt: "ship it",
        subscriptionsOnly: "yes",
      }).success,
    ).toBe(false);
  });
});

describe("CleanTaskRequestSchema", () => {
  it("accepts no body, false and true", () => {
    expect(CleanTaskRequestSchema.parse({})).toEqual({});
    expect(CleanTaskRequestSchema.parse({ deleteBranch: false })).toEqual({
      deleteBranch: false,
    });
    expect(CleanTaskRequestSchema.parse({ deleteBranch: true })).toEqual({ deleteBranch: true });
  });

  it("rejects the wrong type and a field it does not know", () => {
    expect(CleanTaskRequestSchema.safeParse({ deleteBranch: "yes" }).success).toBe(false);
    expect(CleanTaskRequestSchema.safeParse({ deleteBranch: true, force: true }).success).toBe(
      false,
    );
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

describe("OpenTaskQuerySchema", () => {
  it("accepts a named editor, and no editor at all", () => {
    expect(OpenTaskQuerySchema.parse({ editor: "cursor" })).toEqual({ editor: "cursor" });
    expect(OpenTaskQuerySchema.parse({})).toEqual({});
  });

  it("rejects an editor that is not one of the ids, and a field it does not know", () => {
    expect(OpenTaskQuerySchema.safeParse({ editor: "vim" }).success).toBe(false);
    expect(OpenTaskQuerySchema.safeParse({ editor: "cursor", terminal: "iterm" }).success).toBe(
      false,
    );
  });
});

describe("HooksInstallRequestSchema", () => {
  it("accepts a named harness, and nothing at all", () => {
    expect(HooksInstallRequestSchema.parse({ harness: "codex" })).toEqual({ harness: "codex" });
    expect(HooksInstallRequestSchema.parse({})).toEqual({});
  });

  it("rejects an empty harness name and an unknown key", () => {
    expect(HooksInstallRequestSchema.safeParse({ harness: "" }).success).toBe(false);
    expect(HooksInstallRequestSchema.safeParse({ harness: "codex", extra: 1 }).success).toBe(false);
  });
});
