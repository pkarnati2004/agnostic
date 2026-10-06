import type { RepoListRow, TaskListRow } from "@agnostic/core";
import { isClosed, isLive } from "@agnostic/core/browser";
import {
  Archive,
  ArrowRightLeft,
  Coins,
  FolderPlus,
  GitCommit,
  GitMerge,
  GitPullRequest,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Square,
  SquareArrowOutUpRight,
  Trash2,
} from "lucide-react";
import { canAskCommit } from "../changes/commit-result";
import { ARCHIVE_TOOLTIP, canArchive, canDelete } from "../sidebar/task-menu-items";
import { worktreeGone } from "../task/worktree-gone";
import type { PaletteCommand, PaletteGroup } from "./palette-command";

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
  /** Removes the task's worktree: the clean, under the name the page gives it. */
  archive(taskId: string): void;
  /** Opens the confirmation; nothing is deleted until the dialog is answered. */
  delete(taskId: string): void;
  /** Scrolls the usage bar into view and flashes it. */
  showCost(): void;
  /** Opens the Settings dialog, the same one the sidebar's gear opens. */
  settings(): void;
  addRepo(): void;
  sync(repoId: string): void;
};

/** The icon each row carries, by row id: the same glyph the button it stands for uses. */
const ICONS = {
  "new-task": Plus,
  run: Play,
  recommend: Sparkles,
  stop: Square,
  resume: Play,
  handoff: ArrowRightLeft,
  open: SquareArrowOutUpRight,
  pr: GitPullRequest,
  commit: GitCommit,
  update: GitMerge,
  archive: Archive,
  delete: Trash2,
  cost: Coins,
  settings: Settings,
  "add-repo": FolderPlus,
  sync: RefreshCw,
};

type RowId = keyof typeof ICONS;

/**
 * The rows for this moment, in the order ADR 036 Q16 rules. A row is offered only when the button
 * it stands for would be enabled, so the palette never offers a click the header or the panel
 * would refuse. Run and Recommend need a prompt to work from and a repo to run it in.
 */
export function paletteCommands(ctx: PaletteContext, on: PaletteHandlers): PaletteCommand[] {
  const query = ctx.query.trim();
  const repo = ctx.repo;
  const rows: PaletteCommand[] = [
    row("query", "new-task", "New task", "opens the New task tab", () => on.newTask(null)),
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
  rows.push(row("commands", "cost", "Cost", "jumps to the usage bar", on.showCost));
  rows.push(row("commands", "settings", "Settings", "opens Settings", on.settings));
  rows.push(row("commands", "add-repo", "Add repo", "registers a folder with agn", on.addRepo));
  if (repo !== null) {
    rows.push(
      row("commands", "sync", `Sync ${repo.name}`, "writes the repo's generated files", () =>
        on.sync(repo.id),
      ),
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
  const offer = (id: RowId, label: string, hint: string | null, run: () => void) =>
    rows.push(row("task", id, label, hint, run));
  if (isLive(task.status)) {
    offer("stop", `Stop ${task.title}`, where, () => on.stop(task.id));
  }
  if (isClosed(task.status)) {
    offer("resume", `Resume ${task.title}`, where, () => on.resume(task.id));
  }
  if (!worktreeGone(task)) {
    offer("handoff", `Hand off ${task.title}`, where, () => on.handoff(task.id));
  }
  if (task.worktreePresent) {
    offer("open", `Open ${task.title} in editor`, where, () => on.openInEditor(task.id));
  }
  if (task.branch !== null) {
    offer("pr", `Create PR for ${task.title}`, task.branch, () => on.createPr(task.id));
  }
  if (canAskCommit(task, ctx.uncommitted)) {
    offer("commit", `Ask ${task.title} to commit`, task.branch, () => on.commit(task.id));
  }
  if (task.worktreePresent && task.branch !== null) {
    offer("update", `Bring ${task.title} up to date`, where, () => on.update(task.id));
  }
  if (canArchive(task)) {
    offer("archive", "Archive task", ARCHIVE_TOOLTIP, () => on.archive(task.id));
  }
  if (canDelete(task)) {
    offer("delete", "Delete task…", null, () => on.delete(task.id));
  }
  return rows;
}

function row(
  group: PaletteGroup,
  id: RowId,
  label: string,
  hint: string | null,
  run: () => void,
): PaletteCommand {
  return { id, label, hint, fromQuery: false, group, icon: ICONS[id], profileId: null, run };
}

function fromQuery(id: RowId, label: string, hint: string, run: () => void): PaletteCommand {
  return { ...row("query", id, label, hint, run), fromQuery: true };
}
