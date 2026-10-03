import type { RepoListRow, TaskListRow, TaskStatus } from "@agnostic/core";
import { canAskCommit } from "../changes/commit-result";
import { worktreeGone } from "../task/worktree-gone";
import type { PaletteCommand } from "./palette-command";

export type PaletteContext = {
  query: string;
  /** The tab in front when it is a task; null for no tab or a Compare tab. */
  activeTask: TaskListRow | null;
  /** The active task's repo, else the sidebar's default repo, else null. */
  repo: RepoListRow | null;
  /** The active task's uncommitted file count, or null until the Changes panel has read it once. */
  uncommitted: number | null;
};

/** Every click the palette can stand in for. The page hands each one the callback its button uses. */
export type PaletteHandlers = {
  newTask(prefill: { prompt: string } | null): void;
  /** Switches the palette to the recommendation rows rather than starting anything. */
  recommend(repoId: string, prompt: string): void;
  stop(taskId: string): void;
  resume(taskId: string): void;
  handoff(taskId: string): void;
  openInEditor(taskId: string): void;
  createPr(taskId: string): void;
  update(taskId: string): void;
  commit(taskId: string): void;
  /** Scrolls the usage bar into view and flashes it. */
  showCost(): void;
  addRepo(): void;
  sync(repoId: string): void;
};

const STOPPABLE: TaskStatus[] = ["running", "waiting"];
const RESUMABLE: TaskStatus[] = ["done", "failed", "stopped"];

/**
 * The rows for this moment, in the order ADR 036 Q16 rules. A row is offered only when the button
 * it stands for would be enabled, so the palette never offers a click the header or the panel
 * would refuse. Run and Recommend need a prompt to work from and a repo to run it in.
 */
export function paletteCommands(ctx: PaletteContext, on: PaletteHandlers): PaletteCommand[] {
  const query = ctx.query.trim();
  const repo = ctx.repo;
  const rows: PaletteCommand[] = [
    row("new-task", "New task", "opens the New task tab", () => on.newTask(null)),
  ];
  if (query !== "" && repo !== null) {
    rows.push(
      fromQuery("run", `Run: ${query}`, `new task in ${repo.name}`, () =>
        on.newTask({ prompt: query }),
      ),
      fromQuery("recommend", `Recommend: ${query}`, `agn picks a profile in ${repo.name}`, () =>
        on.recommend(repo.id, query),
      ),
    );
  }
  rows.push(...taskCommands(ctx, repo, on));
  rows.push(row("cost", "Cost", "jumps to the usage bar", on.showCost));
  rows.push(row("add-repo", "Add repo", "registers a folder with agn", on.addRepo));
  if (repo !== null) {
    rows.push(
      row("sync", `Sync ${repo.name}`, "writes the repo's generated files", () => on.sync(repo.id)),
    );
  }
  return rows;
}

/**
 * What the tab in front can be asked to do. Hand off, Open and Bring up to date need the worktree,
 * which a clean takes away; Create PR does not, because the push reads the branch from the main
 * checkout, which is why the panel's button ignores the clean too. Whether the remote and the
 * commits are there is the daemon's answer, not the row's: that needs the task's `changes`, which
 * the palette reads only for the uncommitted count the page hands it.
 */
function taskCommands(
  ctx: PaletteContext,
  repo: RepoListRow | null,
  on: PaletteHandlers,
): PaletteCommand[] {
  const task = ctx.activeTask;
  if (task === null) {
    return [];
  }
  const where = repo?.name ?? null;
  const rows: PaletteCommand[] = [];
  if (STOPPABLE.includes(task.status)) {
    rows.push(row("stop", `Stop ${task.title}`, where, () => on.stop(task.id)));
  }
  if (RESUMABLE.includes(task.status)) {
    rows.push(row("resume", `Resume ${task.title}`, where, () => on.resume(task.id)));
  }
  if (!worktreeGone(task)) {
    rows.push(row("handoff", `Hand off ${task.title}`, where, () => on.handoff(task.id)));
  }
  if (task.worktreePresent) {
    rows.push(row("open", `Open ${task.title} in editor`, where, () => on.openInEditor(task.id)));
  }
  if (task.branch !== null) {
    rows.push(row("pr", `Create PR for ${task.title}`, task.branch, () => on.createPr(task.id)));
  }
  if (canAskCommit(task, ctx.uncommitted)) {
    rows.push(row("commit", `Ask ${task.title} to commit`, task.branch, () => on.commit(task.id)));
  }
  if (task.worktreePresent && task.branch !== null) {
    rows.push(row("update", `Bring ${task.title} up to date`, where, () => on.update(task.id)));
  }
  return rows;
}

function row(id: string, label: string, hint: string | null, run: () => void): PaletteCommand {
  return { id, label, hint, fromQuery: false, run };
}

function fromQuery(id: string, label: string, hint: string, run: () => void): PaletteCommand {
  return { id, label, hint, fromQuery: true, run };
}
