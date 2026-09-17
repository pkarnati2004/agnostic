import { RegisterRepoRequestSchema, type Repo } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { addResult, pathProblem, registerRequest } from "./add-repo-request";

const REPO: Repo = {
  id: "r1",
  path: "/Users/dev/petal",
  kind: "git",
  name: "petal",
  addedAt: "2026-09-01T00:00:00.000Z",
  status: "active",
};

describe("pathProblem", () => {
  it("passes an absolute path", () => {
    expect(pathProblem("/Users/dev/petal")).toBeNull();
    expect(pathProblem("  /Users/dev/petal  ")).toBeNull();
  });

  it("says nothing while the field is empty, because Add is disabled anyway", () => {
    expect(pathProblem("")).toBeNull();
    expect(pathProblem("   ")).toBeNull();
  });

  it("passes the root path and a path with a trailing slash or inner whitespace", () => {
    // The one rule pathProblem checks is a leading slash; anything else is the daemon's to judge.
    expect(pathProblem("/")).toBeNull();
    expect(pathProblem("/Users/dev/petal/")).toBeNull();
    expect(pathProblem("/Users/dev/my petal")).toBeNull();
  });

  it("asks for the full path, since the browser can expand neither ~ nor a relative path", () => {
    const problem = pathProblem("code/petal");
    expect(problem?.message).toBe("Type the full path to the folder, starting with /.");
    expect(problem?.hint).toBe("The browser cannot expand ~ or a path relative to a terminal.");
    expect(pathProblem("~/code/petal")).toEqual(problem);
  });
});

describe("registerRequest", () => {
  it("trims the path and sends what the daemon accepts", () => {
    const body = registerRequest({ path: "  /Users/dev/petal  ", gitInit: true });
    expect(body).toEqual({ path: "/Users/dev/petal", gitInit: true });
    expect(RegisterRepoRequestSchema.parse(body)).toEqual(body);
  });

  it("is null while there is nothing to send", () => {
    expect(registerRequest({ path: "   ", gitInit: false })).toBeNull();
  });

  it("trims only the outer whitespace, leaving a trailing slash or an inner space for the daemon", () => {
    expect(registerRequest({ path: " /Users/dev/petal/ ", gitInit: false })).toEqual({
      path: "/Users/dev/petal/",
      gitInit: false,
    });
    expect(registerRequest({ path: "/", gitInit: false })).toEqual({ path: "/", gitInit: false });
  });
});

describe("addResult", () => {
  it("separates a new repo from one agn already had, open or closed", () => {
    expect(addResult({ repo: REPO, created: true })).toEqual({ kind: "added", repo: REPO });
    expect(addResult({ repo: REPO, created: false })).toEqual({ kind: "known", repo: REPO });
    const closed = { ...REPO, status: "archived" as const };
    expect(addResult({ repo: closed, created: false })).toEqual({ kind: "closed", repo: closed });
  });
});
