import type { TaskListRow } from "@agnostic/core";
import { render } from "../test/render";
import { PROFILE, REPO, stubClient } from "../test/workspace-fixture";
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

/** The header as the page mounts it, with only the two things these suites vary. */
export function renderHeader(task: TaskListRow, files: number | null = null) {
  return render(
    <TaskHeader
      task={task}
      repo={REPO}
      profiles={[PROFILE]}
      budget={null}
      cost={null}
      client={stubClient()}
      files={files}
      notice={null}
      changesOpen={false}
      onToggleChanges={() => undefined}
      onStop={() => Promise.resolve()}
      onResume={() => Promise.resolve()}
      onHandoff={() => Promise.resolve(true)}
    />,
  );
}
