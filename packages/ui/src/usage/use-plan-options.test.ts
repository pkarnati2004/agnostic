// @vitest-environment happy-dom
import type { DoctorRequest } from "@agnostic/core";
import { act, createElement } from "react";
import { describe, expect, it } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { render } from "../test/render";
import { doctorResponse, planOptions } from "./usage-response.fixture";
import { usePlanOptions } from "./use-plan-options";

function stubClient(
  calls: DoctorRequest[],
  answer: () => Promise<ReturnType<typeof doctorResponse>>,
): WorkspaceClient {
  return {
    doctor: (body: DoctorRequest) => {
      calls.push(body);
      return answer();
    },
  } as unknown as WorkspaceClient;
}

function mount(client: WorkspaceClient, needed: boolean) {
  const latest: { current: ReturnType<typeof usePlanOptions> | null } = { current: null };
  function Host(props: { needed: boolean }) {
    latest.current = usePlanOptions(client, props.needed);
    return null;
  }
  const rendered = render(createElement(Host, { needed }));
  return {
    latest: () => latest.current as ReturnType<typeof usePlanOptions>,
    setNeeded: (next: boolean) => rendered.update(createElement(Host, { needed: next })),
    unmount: rendered.unmount,
  };
}

/** A few empty microtask turns: enough for a passive effect and a resolved promise to settle. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("usePlanOptions", () => {
  it("asks for nothing while every plan is known", async () => {
    const calls: DoctorRequest[] = [];
    const host = mount(
      stubClient(calls, () => Promise.resolve(doctorResponse())),
      false,
    );
    await flush();

    expect(calls).toEqual([]);
    expect(host.latest().options).toBe(null);
    host.unmount();
  });

  it("detects once, the first time a cell has to ask", async () => {
    const calls: DoctorRequest[] = [];
    const host = mount(
      stubClient(calls, () => Promise.resolve(doctorResponse())),
      false,
    );
    host.setNeeded(true);
    await flush();
    host.setNeeded(true);
    await flush();

    expect(calls).toEqual([{}]);
    expect(host.latest().options).toEqual(planOptions());
    host.unmount();
  });

  it("writes the plan the user picked, for that vendor alone", async () => {
    const calls: DoctorRequest[] = [];
    const host = mount(
      stubClient(calls, () => Promise.resolve(doctorResponse())),
      true,
    );
    await flush();

    await act(async () => {
      await host.latest().setPlan("claude", "max20");
    });

    expect(calls).toEqual([{}, { plans: { claude: "max20" } }]);
    expect(host.latest().busy).toBe(false);
    host.unmount();
  });

  it("keeps the question unanswerable rather than saying why detection failed", async () => {
    const calls: DoctorRequest[] = [];
    const host = mount(
      stubClient(calls, () => Promise.reject(new Error("doctor is not answering"))),
      true,
    );
    await flush();

    expect(calls).toEqual([{}]);
    expect(host.latest().options).toBe(null);
    host.unmount();
  });

  it("rejects a write the daemon refused, so the cell can say so", async () => {
    const calls: DoctorRequest[] = [];
    const host = mount(
      stubClient(calls, () => Promise.reject(new Error("no catalog row for max50"))),
      false,
    );
    await flush();

    await act(async () => {
      await expect(host.latest().setPlan("claude", "max50")).rejects.toThrow("no catalog row");
    });

    expect(host.latest().busy).toBe(false);
    host.unmount();
  });
});
