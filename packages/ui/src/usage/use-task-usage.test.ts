// @vitest-environment happy-dom
import type { TaskUsageResponse } from "@agnostic/core";
import { act, createElement } from "react";
import { describe, expect, it } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { render } from "../test/render";
import { subscriptionTaskUsage } from "./usage-response.fixture";
import { useTaskUsage } from "./use-task-usage";

// `App` reads one task's figures for the tab in front and passes them to one `<TaskCost>`
// (app.tsx); these tests cover the hook does not fetch for no task and reads once the tab has one.

const USAGE: TaskUsageResponse = subscriptionTaskUsage;

function stubClient(taskUsage: (id: string) => Promise<TaskUsageResponse>): WorkspaceClient {
  return { taskUsage } as unknown as WorkspaceClient;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function mount(client: WorkspaceClient, initial: { taskId: string | null; stamp: number }) {
  const latest: { current: TaskUsageResponse | null } = { current: null };
  function Host(props: { taskId: string | null; stamp: number }) {
    latest.current = useTaskUsage(client, props.taskId, props.stamp);
    return null;
  }
  const rendered = render(createElement(Host, initial));
  return {
    latest: () => latest.current,
    // Two steps: the render (a prop change) and a flush for the passive effect it schedules,
    // which happy-dom does not settle inside a single synchronous act().
    setProps: async (next: { taskId: string | null; stamp: number }) => {
      rendered.update(createElement(Host, next));
      await flush();
    },
    unmount: rendered.unmount,
  };
}

describe("useTaskUsage", () => {
  it("reads nothing while no task is selected", async () => {
    let calls = 0;
    const host = mount(
      stubClient(() => {
        calls += 1;
        return Promise.resolve(USAGE);
      }),
      { taskId: null, stamp: 0 },
    );
    await flush();

    expect(calls).toBe(0);
    expect(host.latest()).toBeNull();
    host.unmount();
  });

  it("reads once for the task the tab switched to", async () => {
    const asked: string[] = [];
    const host = mount(
      stubClient((id) => {
        asked.push(id);
        return Promise.resolve(USAGE);
      }),
      { taskId: "t1", stamp: 0 },
    );
    await flush();

    expect(asked).toEqual(["t1"]);
    expect(host.latest()).toEqual(USAGE);
    host.unmount();
  });

  it("reads again for the task a tab switch moves to", async () => {
    const asked: string[] = [];
    const host = mount(
      stubClient((id) => {
        asked.push(id);
        return Promise.resolve(USAGE);
      }),
      { taskId: "t1", stamp: 0 },
    );
    await flush();

    await host.setProps({ taskId: "t2", stamp: 0 });

    expect(asked).toEqual(["t1", "t2"]);
    host.unmount();
  });
});
