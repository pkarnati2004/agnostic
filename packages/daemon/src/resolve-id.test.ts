import type { Repo, Task } from "@agnostic/core";
import { type Ledger, openLedger } from "@agnostic/ledger";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DaemonError } from "./error.js";
import { resolveRepoId, resolveTaskId } from "./resolve-id.js";

let ledger: Ledger;

beforeEach(() => {
  ledger = openLedger(":memory:");
});

afterEach(() => {
  ledger.close();
});

function addRepo(id: string): Repo {
  return ledger.repos.insert({
    id,
    path: `/tmp/${id}`,
    kind: "git",
    name: id,
    addedAt: new Date().toISOString(),
    status: "active",
  });
}

function addTask(id: string, repoId: string): Task {
  const now = new Date().toISOString();
  return ledger.tasks.insert({
    id,
    repoId,
    title: "a task",
    prompt: "do the thing",
    profileId: "claude-code:default:native",
    worktreePath: null,
    branch: null,
    status: "queued",
    origin: "agn",
    baseCommit: null,
    createdAt: now,
    updatedAt: now,
  });
}

function thrown(fn: () => unknown): DaemonError {
  try {
    fn();
  } catch (cause) {
    return cause as DaemonError;
  }
  throw new Error("expected a throw");
}

describe("resolveRepoId", () => {
  it("finds a repo by its whole id", () => {
    const repo = addRepo("abcdefghjk");
    expect(resolveRepoId(ledger, repo.id).id).toBe(repo.id);
  });

  it("finds a repo by a unique three-character prefix", () => {
    addRepo("abcdefghjk");
    addRepo("zyxwvutsrq");
    expect(resolveRepoId(ledger, "abc").id).toBe("abcdefghjk");
  });

  it("calls two matches ambiguous and lists them", () => {
    addRepo("abcdefghjk");
    addRepo("abcmnpqrst");
    const error = thrown(() => resolveRepoId(ledger, "abc"));
    expect(error.code).toBe("ambiguous-id");
    expect(error.hint).toContain("abcdefghjk");
    expect(error.hint).toContain("abcmnpqrst");
  });

  it("will not prefix-match on fewer than three characters", () => {
    addRepo("abcdefghjk");
    expect(thrown(() => resolveRepoId(ledger, "ab")).code).toBe("repo-not-found");
  });

  it("reports an unknown id as not found, with a hint", () => {
    const error = thrown(() => resolveRepoId(ledger, "nosuchrepo"));
    expect(error.code).toBe("repo-not-found");
    expect(error.hint).toContain("agn repos");
  });
});

describe("resolveTaskId", () => {
  it("finds a task by a unique prefix", () => {
    const repo = addRepo("abcdefghjk");
    addTask("mnpqrstuvw", repo.id);
    expect(resolveTaskId(ledger, "mnp").id).toBe("mnpqrstuvw");
  });

  it("calls two tasks sharing a prefix ambiguous", () => {
    const repo = addRepo("abcdefghjk");
    addTask("mnpqrstuvw", repo.id);
    addTask("mnpzyxwvut", repo.id);
    const error = thrown(() => resolveTaskId(ledger, "mnp"));
    expect(error).toBeInstanceOf(DaemonError);
    expect(error.code).toBe("ambiguous-id");
    expect(error.message).toContain("2 tasks");
  });

  it("reports an unknown task with the command that lists them", () => {
    const error = thrown(() => resolveTaskId(ledger, "qqqqqqqqqq"));
    expect(error.code).toBe("task-not-found");
    expect(error.hint).toContain("agn status");
  });
});
