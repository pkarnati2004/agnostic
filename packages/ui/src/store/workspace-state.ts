import type {
  Event,
  EventKind,
  Repo,
  RepoListRow,
  Task,
  TaskListRow,
  TaskStatus,
} from "@agnostic/core";

/**
 * How many `usage.recorded` events have landed, in total and per task. The figures themselves come
 * from `GET /usage`, so the feed only has to say that there is something new to read.
 */
export type UsageStamp = { plans: number; byTask: Record<string, number> };

/**
 * Where the page stands with the daemon: opening the feed, reading it, or waiting to get back onto
 * it. Only the feed writes this; the footer and the daemon-down banner read it.
 */
export type ConnectionState = "connecting" | "live" | "reconnecting";

/** Everything the shell draws. The ledger is the truth; this is the page's copy of it. */
export type WorkspaceState = {
  repos: RepoListRow[];
  tasks: Record<string, TaskListRow>;
  /** The last event id applied, which is where the feed resumes from. */
  cursor: number;
  loaded: boolean;
  usageStamp: UsageStamp;
  connection: ConnectionState;
};

export type WorkspaceAction =
  | { type: "loaded"; repos: RepoListRow[]; tasks: TaskListRow[]; cursor: number }
  | { type: "task"; task: Task }
  | { type: "event"; event: Event }
  | { type: "connection"; state: ConnectionState };

export const EMPTY_WORKSPACE: WorkspaceState = {
  repos: [],
  tasks: {},
  cursor: 0,
  loaded: false,
  usageStamp: { plans: 0, byTask: {} },
  connection: "connecting",
};

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
        usageStamp: { plans: 0, byTask: {} },
        connection: state.connection,
      };
    case "task":
      return { ...state, tasks: { ...state.tasks, [action.task.id]: listed(state, action.task) } };
    case "event":
      // Replay is idempotent, so the cursor advances whether or not the event changed anything.
      return { ...applied(state, action.event), cursor: action.event.id };
    case "connection":
      return { ...state, connection: action.state };
  }
}

function applied(state: WorkspaceState, event: Event): WorkspaceState {
  if (isKind(event, "task.status")) {
    const to = event.payload.to;
    return patchTask(state, event.taskId, (task) => ({
      ...task,
      status: to,
      updatedAt: event.ts,
      // A task that is live again ran from its worktree, whether it was just made or recreated.
      worktreePresent: isLive(to) ? task.worktreePath !== null : task.worktreePresent,
    }));
  }
  if (isKind(event, "task.created")) {
    const task = event.payload.task;
    return { ...state, tasks: { ...state.tasks, [task.id]: withPath(task) } };
  }
  if (isKind(event, "task.cleaned")) {
    // `markCleaned` touches `updated_at`, so the row sorts to the top of History from the feed
    // alone, which is where an archive the user just asked for belongs.
    return patchTask(state, event.taskId, (task) => ({
      ...task,
      worktreePresent: false,
      updatedAt: event.ts,
    }));
  }
  if (isKind(event, "task.deleted")) {
    // The one event that outlives its task: there is no row left to re-read, so the page drops it.
    return withoutTask(state, event.taskId);
  }
  if (isKind(event, "session.captured")) {
    const session = event.payload.session;
    return patchTask(state, event.taskId, (task) => ({ ...task, session }));
  }
  if (isKind(event, "repo.registered") || isKind(event, "repo.updated")) {
    return { ...state, repos: upsertRepo(state.repos, event.payload.repo) };
  }
  if (isKind(event, "usage.recorded")) {
    return { ...state, usageStamp: bumped(state.usageStamp, event.taskId) };
  }
  // Every other kind is about something the shell does not draw: outcomes, plans, recommendations.
  return state;
}

/** An event with no task is a session agn did not start: it moves the plans, nobody's task cost. */
function bumped(stamp: UsageStamp, taskId: string | undefined): UsageStamp {
  const plans = stamp.plans + 1;
  if (taskId === undefined) {
    return { ...stamp, plans };
  }
  return { plans, byTask: { ...stamp.byTask, [taskId]: (stamp.byTask[taskId] ?? 0) + 1 } };
}

/**
 * A row from a response carries no `worktreePresent`, so the page keeps what it knows: a task it
 * has never seen, or one arriving live, ran from its worktree (a resume recreates it, ADR 031).
 */
function listed(state: WorkspaceState, task: Task): TaskListRow {
  const known = state.tasks[task.id];
  if (known === undefined || isLive(task.status)) {
    return withPath(task);
  }
  return { ...task, worktreePresent: known.worktreePresent };
}

/** The worktree a task was just launched or recreated in is there; a folder task has none. */
function withPath(task: Task): TaskListRow {
  return { ...task, worktreePresent: task.worktreePath !== null };
}

function isLive(status: TaskStatus): boolean {
  return status === "running" || status === "waiting";
}

/** A task the page has never seen is not invented from a patch: the feed refetches it instead. */
function patchTask(
  state: WorkspaceState,
  id: string | undefined,
  patch: (task: TaskListRow) => TaskListRow,
): WorkspaceState {
  const task = id === undefined ? undefined : state.tasks[id];
  if (id === undefined || task === undefined) {
    return state;
  }
  return { ...state, tasks: { ...state.tasks, [id]: patch(task) } };
}

/** The rows left once one is gone, or the state itself when the page never had it. */
function withoutTask(state: WorkspaceState, id: string | undefined): WorkspaceState {
  if (id === undefined || state.tasks[id] === undefined) {
    return state;
  }
  const tasks = { ...state.tasks };
  delete tasks[id];
  return { ...state, tasks };
}

/** The event carries the repo row, not the fields the list derives: those come from the list. */
function upsertRepo(repos: RepoListRow[], repo: Repo): RepoListRow[] {
  const known = repos.find((row) => row.id === repo.id);
  // A row that arrives by event was just registered, reactivated or changed status, and `agn add`
  // stat'd its path, so an unknown row's directory is there.
  const updated: RepoListRow = {
    ...repo,
    testCommand: known?.testCommand ?? null,
    pathPresent: known?.pathPresent ?? true,
  };
  return known === undefined
    ? [...repos, updated]
    : repos.map((row) => (row.id === repo.id ? updated : row));
}

function byId(tasks: TaskListRow[]): Record<string, TaskListRow> {
  return Object.fromEntries(tasks.map((task) => [task.id, task]));
}

/** `Event` is a union over its kinds; this is what narrows one to the payload of the kind read. */
function isKind<K extends EventKind>(event: Event, kind: K): event is Event<K> {
  return event.kind === kind;
}
