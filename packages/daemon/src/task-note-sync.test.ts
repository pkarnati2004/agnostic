import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTaskNote, type Task, writeTaskNote } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Logger } from "./log.js";
import { syncTaskNote } from "./task-note-sync.js";

let repo: string;
let errors: { msg: string; fields?: Record<string, string | number> }[];
let log: Logger;

const NOTE = {
  id: "t3n9v2wxyz",
  title: "add a --verbose flag",
  status: "queued" as const,
  profileId: "claude-code:default:native",
  createdAt: "2026-09-11T10:00:00.000Z",
  parentTaskId: null,
  spec: "add a --verbose flag",
  acceptance: "agn --verbose prints the extra lines",
  notes: "keep this line",
  handoffs: [],
};

function task(over: Partial<Task> = {}): Task {
  return {
    id: NOTE.id,
    repoId: "r7k2m4pqrs",
    title: NOTE.title,
    prompt: NOTE.spec,
    profileId: NOTE.profileId,
    worktreePath: null,
    branch: null,
    status: "running",
    origin: "agn",
    createdAt: NOTE.createdAt,
    updatedAt: NOTE.createdAt,
    ...over,
  };
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "agn-note-sync-"));
  errors = [];
  log = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: (msg, fields) => errors.push({ msg, fields }),
    close: () => undefined,
  };
});

afterEach(() => rm(repo, { recursive: true, force: true }));

describe("syncTaskNote", () => {
  it("rewrites the front-matter status and keeps every section", async () => {
    await writeTaskNote(repo, NOTE);
    await syncTaskNote(repo, task({ status: "done" }), log);
    const note = await readTaskNote(repo, NOTE.id);
    expect(note?.status).toBe("done");
    expect(note?.spec).toBe(NOTE.spec);
    expect(note?.acceptance).toBe(NOTE.acceptance);
    expect(note?.notes).toBe(NOTE.notes);
    expect(errors).toEqual([]);
  });

  it("does nothing when the note already has that status", async () => {
    await writeTaskNote(repo, NOTE);
    await syncTaskNote(repo, task({ status: "queued" }), log);
    expect((await readTaskNote(repo, NOTE.id))?.status).toBe("queued");
    expect(errors).toEqual([]);
  });

  it("logs, and does not throw, when the task has no note", async () => {
    await expect(syncTaskNote(repo, task({ status: "done" }), log)).resolves.toBeUndefined();
    expect(errors).toEqual([]);
    expect(await readTaskNote(repo, NOTE.id)).toBeNull();
  });

  it("logs, and does not throw, when the repo path is not a directory a note could live under", async () => {
    const notADirectory = join(repo, "a-file-not-a-repo");
    await writeFile(notADirectory, "not a checkout");
    await syncTaskNote(notADirectory, task({ status: "done" }), log);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.msg).toBe("task note not updated");
    expect(errors[0]?.fields).toMatchObject({ taskId: NOTE.id });
  });
});
