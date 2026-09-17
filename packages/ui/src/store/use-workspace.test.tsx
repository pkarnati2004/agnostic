// @vitest-environment happy-dom
import type { Event, RepoListRow, Task } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { ApiError } from "../api/error";
import { render } from "../test/render";
import { noticeLine } from "./task-notices";
import { followWorkspace, useWorkspace } from "./use-workspace";
import type { WorkspaceAction } from "./workspace-state";

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

const TASK: Task = {
  id: "task1",
  repoId: "repo1",
  title: "Fix the parser",
  prompt: "fix the parser",
  profileId: "claude-code:sonnet-4.5:native",
  worktreePath: null,
  branch: null,
  status: "running",
  origin: "agn",
  baseCommit: null,
  createdAt: "2026-09-14T09:00:00.000Z",
  updatedAt: "2026-09-14T09:00:00.000Z",
};

/** Snapshots with the cursors a daemon would send, and a feed that ends so the bootstrap returns. */
function stubClient(cursors: { repos: number; tasks: number }, feed: Event[] = []) {
  const asked: number[] = [];
  const client = {
    listRepos: () => Promise.resolve({ repos: [REPO], cursor: cursors.repos }),
    listTasks: () => Promise.resolve({ tasks: [TASK], cursor: cursors.tasks }),
    getTask: () => Promise.resolve({ task: TASK }),
    events: (after: number) => {
      asked.push(after);
      return (async function* () {
        yield* feed;
      })();
    },
  } as unknown as WorkspaceClient;
  return { client, asked };
}

async function run(client: WorkspaceClient): Promise<WorkspaceAction[]> {
  const actions: WorkspaceAction[] = [];
  await followWorkspace(client, (action) => actions.push(action), new AbortController().signal);
  return actions;
}

describe("followWorkspace", () => {
  it("loads both snapshots and opens the feed at the older of their cursors", async () => {
    const { client, asked } = stubClient({ repos: 9, tasks: 7 });
    const actions = await run(client);
    expect(actions[0]).toEqual({ type: "loaded", repos: [REPO], tasks: [TASK], cursor: 7 });
    expect(asked).toEqual([7]);
  });

  it("opens the feed at the task cursor when the repo snapshot is the newer one", async () => {
    const { client, asked } = stubClient({ repos: 4, tasks: 11 });
    const actions = await run(client);
    expect(actions[0]).toMatchObject({ type: "loaded", cursor: 4 });
    expect(asked).toEqual([4]);
  });

  it("fails with the daemon's own error when the first snapshot is refused", async () => {
    const forbidden = new ApiError("origin http://evil.test is not allowed", {
      code: "origin-forbidden",
      hint: "Open the workspace from the address `agn ui` prints.",
      status: 403,
    });
    const client = {
      listRepos: () => Promise.reject(forbidden),
      listTasks: () => Promise.resolve({ tasks: [], cursor: 0 }),
      events: () => {
        throw new Error("the feed must not open after a refused snapshot");
      },
    } as unknown as WorkspaceClient;
    const actions: WorkspaceAction[] = [];
    const failure = await followWorkspace(
      client,
      (action) => actions.push(action),
      new AbortController().signal,
    ).catch((cause: unknown) => cause);
    // The page shows this error with no task selected, so the notice sits outside the header.
    expect(failure).toBe(forbidden);
    expect(actions).toEqual([]);
  });

  it("applies what the feed replays, including an event the snapshot already held", async () => {
    const replayed: Event = {
      id: 8,
      ts: "2026-09-14T09:01:00.000Z",
      taskId: TASK.id,
      kind: "task.status",
      payload: { from: "running", to: "waiting" },
    };
    const { client } = stubClient({ repos: 7, tasks: 7 }, [replayed]);
    const actions = await run(client);
    expect(actions[1]).toEqual({ type: "event", event: replayed });
  });
});

const BUSY = new ApiError("the session is already gone", {
  code: "session-missing",
  hint: "Reload the workspace.",
  status: 409,
});

/** One task's header, wired the way the page wires Stop: the answer shows where the click was. */
function Header({ client, stop }: { client: WorkspaceClient; stop: () => Promise<Task> }) {
  const { state, notices, act: onStop } = useWorkspace(client);
  const failure = notices[TASK.id];
  return (
    <div>
      <button
        type="button"
        onClick={() => void onStop({ taskId: TASK.id, action: "stop", host: "header" }, stop)}
      >
        {state.tasks[TASK.id]?.status ?? "unknown"}
      </button>
      {failure === undefined ? null : <p>{`${failure.host}: ${noticeLine(failure, TASK)}`}</p>}
    </div>
  );
}

async function clickStop(container: HTMLElement): Promise<void> {
  await act(async () => {
    container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("act", () => {
  it("shows the refusal under the host that asked, and clears it when the next call answers", async () => {
    const stopped: Task = { ...TASK, status: "stopped" };
    let refuse = true;
    const stop = () => (refuse ? Promise.reject(BUSY) : Promise.resolve(stopped));
    const { client } = stubClient({ repos: 3, tasks: 3 });
    const { container, unmount } = render(<Header client={client} stop={stop} />);

    await clickStop(container);
    expect(container.textContent).toContain("header: Stop failed for Fix the parser");
    expect(container.textContent).toContain("the session is already gone");

    refuse = false;
    await clickStop(container);
    expect(container.textContent).not.toContain("Stop failed");
    // The task the call answered with is applied too, so the header reads the new status.
    expect(container.querySelector("button")?.textContent).toBe("stopped");
    unmount();
  });
});
