import type { ChangedFile, ChangesResponse } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { requireTaskId } from "../resolve-repo.js";
import { type Column, renderTable } from "../table.js";

type ChangesFlags = { patch?: string };

const LETTERS: Record<ChangedFile["status"], string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  untracked: "?",
};

export function changesCommand(ctx: CliContext): Command {
  return new Command("changes")
    .description("what a task changed against its base, with line counts")
    .argument("[task]", "task id or prefix; defaults to the task of the worktree you are in")
    .option("--patch <path>", "print one file's diff instead of the list")
    .action(async (task: string | undefined, flags: ChangesFlags, command: Command) => {
      const client = await ctx.client();
      const id = await requireTaskId(ctx, command, task);
      if (flags.patch !== undefined) {
        const diff = await client.taskDiff(id, flags.patch);
        printPatch(ctx, diff.patch);
        return;
      }
      const changes = await client.taskChanges(id);
      if (ctx.json) {
        writeJson(ctx.io, changes);
        return;
      }
      for (const line of render(changes)) {
        ctx.io.out(line);
      }
    });
}

function printPatch(ctx: CliContext, patch: string): void {
  if (ctx.json) {
    writeJson(ctx.io, { patch });
    return;
  }
  for (const line of patch === "" ? [] : patch.split("\n")) {
    ctx.io.out(line);
  }
}

// The header line says what the columns are, so the table itself has no headers to print.
const COLUMNS: Column<ChangedFile>[] = [
  { header: "", value: (file) => file.path },
  { header: "", value: (file) => LETTERS[file.status] },
  { header: "", value: counts },
];

function render(changes: ChangesResponse): string[] {
  if (changes.files.length === 0) {
    return [`no changes against ${changes.base.ref} yet`];
  }
  return [header(changes), ...renderTable(changes.files, COLUMNS).slice(1)];
}

/** The line the workspace's panel shows above the file list, in the same order. */
function header(changes: ChangesResponse): string {
  const branch = changes.task.branch ?? "this task";
  const summary = `${plural(changes.ahead, "commit")}, ${changes.uncommitted} uncommitted`;
  const behind = changes.behind ? `, behind ${changes.behind}` : "";
  return `${branch} -> ${changes.base.ref}  ${summary}${behind}  ${
    changes.pushed ? "pushed" : "not pushed"
  }`;
}

function counts(file: ChangedFile): string {
  if (file.status === "untracked") {
    return "untracked";
  }
  if (file.additions === null || file.deletions === null) {
    return "binary";
  }
  return `+${file.additions} -${file.deletions}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
