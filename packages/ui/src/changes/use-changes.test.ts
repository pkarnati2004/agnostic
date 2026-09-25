// @vitest-environment happy-dom
import type { ChangesResponse, TaskListRow } from "@agnostic/core";
import { act, createElement } from "react";
import { describe, expect, it } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { render } from "../test/render";
import { stubClient } from "../test/workspace-fixture";
import { changesResponse, taskRow } from "./changes-fixture";
import { type Changes, useChanges } from "./use-changes";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Exposes the hook's latest return value on every render, so a test can read it after an act(). */
function mount(client: WorkspaceClient, task: TaskListRow | null) {
  const latest: { current: Changes | null } = { current: null };
  const loaded: ChangesResponse[] = [];
  function Host(props: { task: TaskListRow | null }) {
    // A new function on every render, which is what the hook's ref is there to absorb.
    latest.current = useChanges(client, props.task, (response) => loaded.push(response));
    return null;
  }
  const rendered = render(createElement(Host, { task }));
  return {
    latest: () => latest.current as Changes,
    loaded: () => loaded,
    setTask: async (next: TaskListRow | null) => {
      rendered.update(createElement(Host, { task: next }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    },
    unmount: rendered.unmount,
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function client(over: Partial<WorkspaceClient> = {}): WorkspaceClient {
  return stubClient({ diff: () => Promise.resolve({ patch: "" }), ...over });
}

function readyResponse(host: { latest(): Changes }): ChangesResponse {
  const state = host.latest().state;
  if (state.kind !== "ready") {
    throw new Error(`expected ready, got ${state.kind}`);
  }
  return state.response;
}

describe("useChanges stale-answer guard", () => {
  it("drops a changes answer for a task the panel has moved on from", async () => {
    const first = deferred<ChangesResponse>();
    const task1 = taskRow({ id: "task1" });
    const task2 = taskRow({ id: "task2", branch: "agn/other" });
    const host = mount(
      client({
        changes: (id) =>
          id === "task1"
            ? first.promise
            : Promise.resolve(changesResponse({ task: task2, files: [] })),
      }),
      task1,
    );
    await host.setTask(task2);
    expect(readyResponse(host).task.id).toBe("task2");

    await act(async () => {
      first.resolve(changesResponse({ task: task1 }));
      await first.promise;
    });

    expect(readyResponse(host).task.id).toBe("task2");
    host.unmount();
  });
});

describe("useChanges onLoaded", () => {
  it("hands each read that lands to the caller, and re-reads nothing for a new callback", async () => {
    let reads = 0;
    const host = mount(
      client({
        changes: () => {
          reads += 1;
          return Promise.resolve(changesResponse({ files: [], uncommitted: 4 }));
        },
      }),
      taskRow({ status: "running" }),
    );
    await flush();
    expect(reads).toBe(1);
    expect(host.loaded().map((response) => response.uncommitted)).toEqual([4]);

    // The same task again: a render with a new callback must not be a new read.
    await host.setTask(taskRow({ status: "running" }));
    expect(reads).toBe(1);
    expect(host.loaded()).toHaveLength(1);
    host.unmount();
  });
});

describe("useChanges refetch triggers", () => {
  it("re-reads the list when the task's status changes", async () => {
    let reads = 0;
    const host = mount(
      client({
        changes: () => {
          reads += 1;
          return Promise.resolve(changesResponse({ files: [] }));
        },
      }),
      taskRow({ status: "running" }),
    );
    await flush();
    expect(reads).toBe(1);

    await host.setTask(taskRow({ status: "done" }));
    expect(reads).toBe(2);
    host.unmount();
  });

  it("re-reads the list when the worktree appears or is cleaned", async () => {
    let reads = 0;
    const host = mount(
      client({
        changes: () => {
          reads += 1;
          return Promise.resolve(changesResponse({ files: [] }));
        },
      }),
      taskRow({ worktreePresent: true }),
    );
    await flush();
    expect(reads).toBe(1);

    await host.setTask(taskRow({ worktreePresent: false }));
    expect(reads).toBe(2);
    host.unmount();
  });

  it("does not re-read the list for a prop that is not one of its triggers", async () => {
    let reads = 0;
    const host = mount(
      client({
        changes: () => {
          reads += 1;
          return Promise.resolve(changesResponse({ files: [] }));
        },
      }),
      taskRow({ title: "Add the invite links" }),
    );
    await flush();
    expect(reads).toBe(1);

    await host.setTask(taskRow({ title: "Add the invite links, v2" }));
    expect(reads).toBe(1);
    host.unmount();
  });
});
