import type { Event, EventKind, Repo, RepoListRow, Task } from "@agnostic/core";

/** Everything the shell draws. The ledger is the truth; this is the page's copy of it. */
export type WorkspaceState = {
  repos: RepoListRow[];
  tasks: Record<string, Task>;
  /** The last event id applied, which is where the feed resumes from. */
  cursor: number;
  loaded: boolean;
};

export type WorkspaceAction =
  | { type: "loaded"; repos: RepoListRow[]; tasks: Task[]; cursor: number }
  | { type: "task"; task: Task }
  | { type: "event"; event: Event };

export const EMPTY_WORKSPACE: WorkspaceState = { repos: [], tasks: {}, cursor: 0, loaded: false };

/** Kinds whose effect on a task is more than the event carries, so the page re-reads the row. */
export const REFETCH_KINDS: ReadonlySet<EventKind> = new Set<EventKind>([
  "task.cleaned",
  "task.adopted",
  "task.handoff",
]);

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "loaded":
      return {
        repos: action.repos,
        tasks: byId(action.tasks),
        cursor: action.cursor,
        loaded: true,
      };
    case "task":
      return { ...state, tasks: { ...state.tasks, [action.task.id]: action.task } };
    case "event":
      // Replay is idempotent, so the cursor advances whether or not the event changed anything.
      return { ...applied(state, action.event), cursor: action.event.id };
  }
}

function applied(state: WorkspaceState, event: Event): WorkspaceState {
  if (isKind(event, "task.status")) {
    const to = event.payload.to;
    return patchTask(state, event.taskId, (task) => ({ ...task, status: to, updatedAt: event.ts }));
  }
  if (isKind(event, "task.created")) {
    return { ...state, tasks: { ...state.tasks, [event.payload.task.id]: event.payload.task } };
  }
  if (isKind(event, "session.captured")) {
    const session = event.payload.session;
    return patchTask(state, event.taskId, (task) => ({ ...task, session }));
  }
  if (isKind(event, "repo.registered") || isKind(event, "repo.updated")) {
    return { ...state, repos: upsertRepo(state.repos, event.payload.repo) };
  }
  // Every other kind is about something the shell does not draw: usage, outcomes, plans.
  return state;
}

/** A task the page has never seen is not invented from a patch: the feed refetches it instead. */
function patchTask(
  state: WorkspaceState,
  id: string | undefined,
  patch: (task: Task) => Task,
): WorkspaceState {
  const task = id === undefined ? undefined : state.tasks[id];
  if (id === undefined || task === undefined) {
    return state;
  }
  return { ...state, tasks: { ...state.tasks, [id]: patch(task) } };
}

/** The event carries the repo row, not the `.ag/agnostic.yaml` field that travels with it. */
function upsertRepo(repos: RepoListRow[], repo: Repo): RepoListRow[] {
  const known = repos.find((row) => row.id === repo.id);
  const updated: RepoListRow = { ...repo, testCommand: known?.testCommand ?? null };
  return known === undefined
    ? [...repos, updated]
    : repos.map((row) => (row.id === repo.id ? updated : row));
}

function byId(tasks: Task[]): Record<string, Task> {
  return Object.fromEntries(tasks.map((task) => [task.id, task]));
}

/** `Event` is a union over its kinds; this is what narrows one to the payload of the kind read. */
function isKind<K extends EventKind>(event: Event, kind: K): event is Event<K> {
  return event.kind === kind;
}
