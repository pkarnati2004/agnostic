import type { TaskListRow } from "@agnostic/core";
import { TooltipProvider } from "../components/tooltip";
import type { TaskRowActions } from "../sidebar/task-row-actions";
import { render } from "../test/render";
import { PROFILE, REPO, stubClient, WithRowActions } from "../test/workspace-fixture";
import { TaskHeader } from "./task-header";

export function headerTask(
  id: string,
  title: string,
  over: Partial<TaskListRow> = {},
): TaskListRow {
  return {
    id,
    repoId: REPO.id,
    title,
    prompt: title,
    profileId: PROFILE.id,
    worktreePath: `/tmp/wt/${id}`,
    branch: "agn/one",
    status: "running",
    origin: "agn",
    baseCommit: null,
    compareId: null,
    createdAt: "2026-09-14T09:00:00.000Z",
    updatedAt: "2026-09-14T10:00:00.000Z",
    worktreePresent: true,
    ...over,
  };
}

/** The header under the two providers the page mounts above it, with what these suites vary. */
export function headerTree(
  task: TaskListRow,
  over: {
    repo?: typeof REPO | null;
    files?: number | null;
    notice?: Parameters<typeof TaskHeader>[0]["notice"];
    actions?: Partial<TaskRowActions>;
    changes?: { open: boolean; onToggle: () => void };
  } = {},
) {
  return (
    <TooltipProvider>
      <WithRowActions actions={over.actions}>
        <TaskHeader
          task={task}
          repo={over.repo === undefined ? REPO : over.repo}
          profiles={[PROFILE]}
          budget={null}
          client={stubClient()}
          files={over.files ?? null}
          notice={over.notice ?? null}
          changesOpen={over.changes?.open ?? false}
          onToggleChanges={over.changes?.onToggle ?? (() => undefined)}
          onStop={() => Promise.resolve()}
          onResume={() => Promise.resolve()}
          onHandoff={() => Promise.resolve(true)}
        />
      </WithRowActions>
    </TooltipProvider>
  );
}

export function renderHeader(task: TaskListRow, files: number | null = null) {
  return render(headerTree(task, { files }));
}
