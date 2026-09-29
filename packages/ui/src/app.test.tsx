// @vitest-environment happy-dom
import type { Event, RepoListRow, TaskListRow } from "@agnostic/core";
import { act, useEffect, useReducer } from "react";
import { describe, expect, it } from "vitest";
import type { WorkspaceClient } from "./api/client";
import { useRepoActions } from "./repo/use-repo-actions";
import { useWorkspace } from "./store/use-workspace";
import { NO_TABS, tabbableTasks, tabsReducer } from "./tabs/tabs-state";
import { render } from "./test/render";

/**
 * Reproduces the live report on commit 70422f5: repo R is registered with task T open in its tab,
 * R is closed then removed, and T's tab should close with it. This drives the real `useWorkspace`
 * feed and the real `tabsReducer`/`tabbableTasks` pair the way `Workspace` in `app.tsx` wires them;
 * `useTabsStorage` itself is not exported, so `Harness` below repeats only its prune effect, using
 * the same two exported functions the real one calls.
 */

const REPO: RepoListRow = {
  id: "repo1",
  path: "/tmp/petal",
  kind: "git",
  name: "petal",
  addedAt: "2026-09-01T00:00:00.000Z",
  status: "active",
  testCommand: null,
  pathPresent: true,
};

const TASK: TaskListRow = {
  id: "task1",
  repoId: "repo1",
  title: "Fix the parser",
  prompt: "fix the parser",
  profileId: "claude-code:sonnet-4.5:native",
  worktreePath: "/tmp/petal-worktrees/task1",
  branch: "agn/task1",
  status: "stopped",
  origin: "agn",
  baseCommit: null,
  compareId: null,
  createdAt: "2026-09-14T09:00:00.000Z",
  updatedAt: "2026-09-14T09:00:00.000Z",
  worktreePresent: true,
};

/** A feed the test can push events into, the way the daemon's SSE stream delivers them one at a time. */
function pushableFeed() {
  const queue: Event[] = [];
  let wake: (() => void) | null = null;
  let closed = false;
  return {
    push(event: Event): void {
      queue.push(event);
      wake?.();
      wake = null;
    },
    close(): void {
      closed = true;
      wake?.();
      wake = null;
    },
    events: (): AsyncGenerator<Event> =>
      (async function* () {
        for (;;) {
          const next = queue.shift();
          if (next !== undefined) {
            yield next;
            continue;
          }
          if (closed) {
            return;
          }
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      })(),
  };
}

/** The daemon's exact `repo.updated` payload: the whole `Repo` row, nothing derived (see repo-queries.ts). */
function repoRow(status: RepoListRow["status"]) {
  return {
    id: REPO.id,
    path: REPO.path,
    kind: REPO.kind,
    name: REPO.name,
    addedAt: REPO.addedAt,
    status,
  };
}

function stubClient(overrides: Partial<WorkspaceClient>, feed: ReturnType<typeof pushableFeed>) {
  return {
    listRepos: () => Promise.resolve({ repos: [REPO], cursor: 1 }),
    listTasks: () => Promise.resolve({ tasks: [TASK], cursor: 1 }),
    getTask: () => Promise.resolve({ task: TASK }),
    events: () => feed.events(),
    ...overrides,
  } as unknown as WorkspaceClient;
}

/**
 * The smallest real composition: `useWorkspace` for the feed, `tabsReducer` for the tabs, and the
 * same prune-on-load effect `useTabsStorage` runs in `app.tsx` (`tabbableTasks` plus a dispatch),
 * since that hook itself is private to `app.tsx`. `Remove` wires the real `useRepoActions`, the
 * hook `RemoveRepoDialog` calls.
 */
function Harness({ client }: { client: WorkspaceClient }) {
  const { state } = useWorkspace(client);
  const [tabs, dispatchTabs] = useReducer(tabsReducer, NO_TABS);
  const repoActions = useRepoActions(client);
  useEffect(() => {
    if (state.loaded) {
      dispatchTabs({ type: "prune", keep: tabbableTasks(state.repos, state.tasks) });
    }
  }, [state.loaded, state.repos, state.tasks]);
  return (
    <div>
      <div data-testid="open">{tabs.open.join(",")}</div>
      <div data-testid="active">{tabs.active ?? ""}</div>
      <button type="button" onClick={() => dispatchTabs({ type: "open", taskId: TASK.id })}>
        open
      </button>
      <button type="button" onClick={() => void repoActions.remove(REPO.id)}>
        remove
      </button>
    </div>
  );
}

function openTab(container: HTMLElement): void {
  act(() => {
    container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function clickRemove(container: HTMLElement): void {
  const button = Array.from(container.querySelectorAll("button")).find(
    (found) => found.textContent === "remove",
  );
  act(() => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function open(container: HTMLElement): string {
  return container.querySelector("[data-testid='open']")?.textContent ?? "";
}

function active(container: HTMLElement): string {
  return container.querySelector("[data-testid='active']")?.textContent ?? "";
}

describe("Workspace tabs against a live repo removal", () => {
  it("closes T's tab when the repo is closed then removed, matching the live report", async () => {
    const feed = pushableFeed();
    const client = stubClient({}, feed);
    const { container, unmount } = render(<Harness client={client} />);
    await flush();

    openTab(container);
    expect(open(container)).toBe(TASK.id);
    expect(active(container)).toBe(TASK.id);

    // agn closes R: the tab stays, closing deletes nothing.
    feed.push({
      id: 2,
      ts: "2026-09-14T10:00:00.000Z",
      repoId: REPO.id,
      kind: "repo.updated",
      payload: { repo: repoRow("archived") },
    });
    await flush();
    expect(open(container)).toBe(TASK.id);
    expect(active(container)).toBe(TASK.id);

    // Six seconds later `DELETE /repos/:id` lands and the ledger emits the removal.
    feed.push({
      id: 3,
      ts: "2026-09-14T10:00:06.000Z",
      repoId: REPO.id,
      kind: "repo.updated",
      payload: { repo: repoRow("removed") },
    });
    await flush();
    expect(open(container)).toBe("");
    expect(active(container)).toBe("");

    unmount();
  });

  it("closes T's tab on a removed event with no preceding archived event", async () => {
    const feed = pushableFeed();
    const client = stubClient({}, feed);
    const { container, unmount } = render(<Harness client={client} />);
    await flush();

    openTab(container);
    expect(open(container)).toBe(TASK.id);

    feed.push({
      id: 2,
      ts: "2026-09-14T10:00:06.000Z",
      repoId: REPO.id,
      kind: "repo.updated",
      payload: { repo: repoRow("removed") },
    });
    await flush();
    expect(open(container)).toBe("");
    expect(active(container)).toBe("");

    unmount();
  });

  it("closes T's tab when the removal is driven from the page's own Remove button", async () => {
    const feed = pushableFeed();
    const client = stubClient(
      { removeRepo: () => Promise.resolve({ repo: repoRow("removed"), worktreesRemoved: 1 }) },
      feed,
    );
    const { container, unmount } = render(<Harness client={client} />);
    await flush();

    openTab(container);
    expect(open(container)).toBe(TASK.id);

    // The dialog's onRemove call: the row leaves the sidebar through the `repo.updated` event the
    // call causes, not from the response, so the test pushes the event `removeRepo` implies (see
    // remove-repo-dialog.tsx: "The row leaves the sidebar through `repo.updated`, not from here.").
    clickRemove(container);
    await flush();
    feed.push({
      id: 2,
      ts: "2026-09-14T10:00:06.000Z",
      repoId: REPO.id,
      kind: "repo.updated",
      payload: { repo: repoRow("removed") },
    });
    await flush();

    expect(open(container)).toBe("");
    expect(active(container)).toBe("");

    unmount();
  });
});
