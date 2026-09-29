import type { RepoListRow, Task } from "@agnostic/core";

/** The open tabs and the active one, kept per origin so dev and the daemon do not share a list. */
export type TabsState = { open: string[]; active: string | null };

export type TabsAction =
  /** `taskId` is a task id or a `compare:<id>`: both are tabs and neither knows about the other. */
  | { type: "open"; taskId: string }
  | { type: "close"; taskId: string }
  | { type: "activate"; taskId: string }
  /** The tasks still worth a tab; every other open tab closes as an ordinary close would. */
  | { type: "prune"; keep: ReadonlySet<string> };

export const TABS_KEY = "agn.tabs";

/** A tab id that is not a task's: the Compare view of a group of siblings (ADR 036 Q7). */
const COMPARE_TAB = "compare:";

export function compareTabId(compareId: string): string {
  return `${COMPARE_TAB}${compareId}`;
}

export function compareIdOf(tabId: string | null): string | null {
  if (tabId === null || !tabId.startsWith(COMPARE_TAB)) {
    return null;
  }
  const compareId = tabId.slice(COMPARE_TAB.length);
  return compareId === "" ? null : compareId;
}

export const NO_TABS: TabsState = { open: [], active: null };

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case "open":
      return state.open.includes(action.taskId)
        ? { ...state, active: action.taskId }
        : { open: [...state.open, action.taskId], active: action.taskId };
    case "activate":
      return state.open.includes(action.taskId) ? { ...state, active: action.taskId } : state;
    case "close":
      return without(state, (id) => id !== action.taskId);
    case "prune":
      return without(state, (id) => action.keep.has(id));
  }
}

/**
 * The tabs that may stay open: a task the daemon still has, under a repo the page draws, and the
 * Compare view of any group those tasks still name. Removing a repo deletes its tasks' worktrees
 * (ADR 034), so their tabs have nothing left to show; closing a repo deletes nothing, so its tabs
 * stay. A repo the page was never given was removed before it loaded, since `GET /repos?all=1`
 * lists the closed ones.
 */
export function tabbableTasks(
  repos: RepoListRow[],
  tasks: Record<string, Pick<Task, "repoId" | "compareId">>,
): ReadonlySet<string> {
  const drawn = new Set(repos.filter((repo) => repo.status !== "removed").map((repo) => repo.id));
  const kept = Object.entries(tasks).filter(([, task]) => drawn.has(task.repoId));
  const ids = kept.map(([id]) => id);
  const compares = kept
    .map(([, task]) => task.compareId)
    .filter((compareId) => compareId !== null)
    .map(compareTabId);
  return new Set([...ids, ...compares]);
}

/** Whatever goes, the tab to its right takes over, then the one to its left, then nothing. */
function without(state: TabsState, keep: (taskId: string) => boolean): TabsState {
  const open = state.open.filter(keep);
  if (open.length === state.open.length) {
    return state;
  }
  if (state.active === null || keep(state.active)) {
    return { ...state, open };
  }
  return { open, active: neighbour(state.open, state.active, keep) };
}

function neighbour(open: string[], gone: string, keep: (taskId: string) => boolean): string | null {
  const index = open.indexOf(gone);
  for (let right = index + 1; right < open.length; right += 1) {
    const id = open[right];
    if (id !== undefined && keep(id)) {
      return id;
    }
  }
  for (let left = index - 1; left >= 0; left -= 1) {
    const id = open[left];
    if (id !== undefined && keep(id)) {
      return id;
    }
  }
  return null;
}

/** A list written by another version, or by hand, is not worth arguing with: the page starts empty. */
export function readTabs(storage: Pick<Storage, "getItem">): TabsState {
  const raw = storage.getItem(TABS_KEY);
  if (raw === null) {
    return NO_TABS;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NO_TABS;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return NO_TABS;
  }
  const { open, active } = parsed as { open?: unknown; active?: unknown };
  if (!Array.isArray(open) || !open.every((id) => typeof id === "string")) {
    return NO_TABS;
  }
  const ids: string[] = open;
  return { open: ids, active: typeof active === "string" && ids.includes(active) ? active : null };
}

export function writeTabs(storage: Pick<Storage, "setItem">, state: TabsState): void {
  storage.setItem(TABS_KEY, JSON.stringify(state));
}
