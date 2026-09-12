import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CoreError } from "@agnostic/core";
import { afterEach, describe, expect, it } from "vitest";
import { GENERATED_HEADER, renderTarget } from "./generated-header.js";
import { applySyncPlan, readSyncInputs } from "./sync-files.js";
import { planSync } from "./sync-plan.js";
import { copyFixture, removeCopies } from "./test-repo.js";

afterEach(removeCopies);

async function sync(repoPath: string, force = false): Promise<void> {
  const inputs = await readSyncInputs(repoPath);
  await applySyncPlan(repoPath, planSync(inputs, { force }));
}

function code(cause: unknown): string {
  return cause instanceof CoreError ? cause.code : String(cause);
}

describe("readSyncInputs", () => {
  it("refuses a repo with no instructions to generate from", async () => {
    const repo = await copyFixture("claude-only");
    await expect(readSyncInputs(repo)).rejects.toSatisfy(
      (cause: unknown) => code(cause) === "instructions-missing",
    );
  });

  it("reads the instructions and both targets", async () => {
    const repo = await copyFixture("synced");
    const inputs = await readSyncInputs(repo);
    expect(inputs.instructions.startsWith("# fixture app")).toBe(true);
    expect(inputs.existing["CLAUDE.md"]?.startsWith(GENERATED_HEADER)).toBe(true);
    expect(inputs.existing["AGENTS.md"]?.startsWith(GENERATED_HEADER)).toBe(true);
  });
});

describe("applySyncPlan", () => {
  it("writes both targets from the instructions", async () => {
    const repo = await copyFixture("stale");
    const inputs = await readSyncInputs(repo);
    await sync(repo);
    expect(await readFile(join(repo, "AGENTS.md"), "utf8")).toBe(
      renderTarget("AGENTS.md", inputs.instructions),
    );
    expect(await readFile(join(repo, "CLAUDE.md"), "utf8")).toBe(
      renderTarget("CLAUDE.md", inputs.instructions),
    );
  });

  it("writes nothing at all when one target is a conflict", async () => {
    const repo = await copyFixture("hand-edited");
    const before = await readFile(join(repo, "CLAUDE.md"), "utf8");
    const inputs = await readSyncInputs(repo);
    // AGENTS.md is out of date here, so a partial apply would be visible.
    await writeFile(join(repo, "AGENTS.md"), `${GENERATED_HEADER}\n\nolder\n`, "utf8");
    const writes = planSync({ ...inputs, existing: await targets(repo) }, { force: false });
    await expect(applySyncPlan(repo, writes)).rejects.toSatisfy(
      (cause: unknown) => code(cause) === "sync-conflict",
    );
    await expect(applySyncPlan(repo, writes)).rejects.toThrow(/CLAUDE\.md/);
    expect(await readFile(join(repo, "CLAUDE.md"), "utf8")).toBe(before);
    expect(await readFile(join(repo, "AGENTS.md"), "utf8")).toBe(`${GENERATED_HEADER}\n\nolder\n`);
  });

  it("points the conflict at --force so the user knows how to get past it", async () => {
    const repo = await copyFixture("hand-edited");
    const writes = planSync(await readSyncInputs(repo), { force: false });
    await expect(applySyncPlan(repo, writes)).rejects.toSatisfy((cause: unknown) => {
      if (!(cause instanceof CoreError)) {
        return false;
      }
      return cause.code === "sync-conflict" && (cause.hint ?? "").includes("--force");
    });
  });

  it("changes no bytes and no mtime on a second run", async () => {
    const repo = await copyFixture("stale");
    await sync(repo);
    const first = await Promise.all(["CLAUDE.md", "AGENTS.md"].map((file) => marks(repo, file)));
    await sync(repo);
    const second = await Promise.all(["CLAUDE.md", "AGENTS.md"].map((file) => marks(repo, file)));
    expect(second).toEqual(first);
  });

  it("keeps the mode of a target it rewrites", async () => {
    const repo = await copyFixture("stale");
    await chmod(join(repo, "AGENTS.md"), 0o640);
    await sync(repo);
    expect((await stat(join(repo, "AGENTS.md"))).mode & 0o777).toBe(0o640);
  });

  it("overwrites a hand-written target with force", async () => {
    const repo = await copyFixture("hand-edited");
    await sync(repo, true);
    expect(await readFile(join(repo, "CLAUDE.md"), "utf8")).toBe(
      renderTarget("CLAUDE.md", (await readSyncInputs(repo)).instructions),
    );
  });
});

async function targets(repo: string) {
  return {
    "CLAUDE.md": await readFile(join(repo, "CLAUDE.md"), "utf8"),
    "AGENTS.md": await readFile(join(repo, "AGENTS.md"), "utf8"),
  };
}

async function marks(repo: string, file: string): Promise<[string, number]> {
  const path = join(repo, file);
  return [await readFile(path, "utf8"), (await stat(path)).mtimeMs];
}
