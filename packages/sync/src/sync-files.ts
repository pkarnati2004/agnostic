import { chmod, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readAgText, readTextFile, type SyncWrite } from "@agnostic/core";
import { SyncError } from "./error.js";
import type { SyncInputs } from "./sync-plan.js";

export async function readSyncInputs(repoPath: string): Promise<SyncInputs> {
  const instructions = await readAgText(repoPath, "instructions.md");
  if (instructions === null) {
    throw new SyncError(`${repoPath} has no .ag/instructions.md to generate from`, {
      code: "instructions-missing",
      hint: "Run `agn init` in this repo first.",
    });
  }
  return {
    instructions,
    existing: {
      "CLAUDE.md": await readTextFile(join(repoPath, "CLAUDE.md")),
      "AGENTS.md": await readTextFile(join(repoPath, "AGENTS.md")),
    },
  };
}

/** All or nothing: one target agn would overwrite by hand stops the whole plan. */
export async function applySyncPlan(repoPath: string, writes: SyncWrite[]): Promise<void> {
  const conflicts = writes.filter((write) => write.action === "conflict");
  if (conflicts.length > 0) {
    throw conflictError(conflicts);
  }
  for (const write of writes) {
    if (write.action === "create" || write.action === "update") {
      await writeTarget(join(repoPath, write.file), write.content);
    }
  }
}

function conflictError(conflicts: SyncWrite[]): SyncError {
  const files = conflicts.map((write) => write.file).join(" and ");
  const verb = conflicts.length === 1 ? "was" : "were";
  return new SyncError(`${files} ${verb} written by hand and agn will not overwrite that`, {
    code: "sync-conflict",
    hint: "Merge what you want to keep into .ag/instructions.md, then run `agn sync --force`.",
  });
}

/** Temp file and rename, so an agent reading the file never sees half of it. */
async function writeTarget(file: string, content: string): Promise<void> {
  const mode = await stat(file).then(
    (stats) => stats.mode,
    () => null,
  );
  const temp = `${file}.agn-${process.pid}`;
  await writeFile(temp, content, "utf8");
  if (mode !== null) {
    await chmod(temp, mode);
  }
  await rename(temp, file);
}
