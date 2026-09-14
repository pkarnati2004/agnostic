// @vitest-environment happy-dom
import type { SpecResponse } from "@agnostic/core";
import { act, createElement } from "react";
import { describe, expect, it } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { ApiError } from "../api/error";
import { render } from "../test/render";
import { type SpecWriter, useSpecWriter } from "./use-spec-writer";

const SPEC: SpecResponse = {
  title: "Add a retry budget",
  spec: "Change the client.",
  acceptance: "- [ ] the client retries",
  profileId: "claude-code:opus:native",
  model: "opus",
};

const OTHER_SPEC: SpecResponse = {
  title: "Add a flag",
  spec: "Change the CLI.",
  acceptance: null,
  profileId: "codex:gpt-5:native",
  model: "gpt-5",
};

function stubClient(writeSpec: WorkspaceClient["writeSpec"]): WorkspaceClient {
  return { writeSpec } as unknown as WorkspaceClient;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Exposes the hook's latest return value on every render, so a test can read it after an act(). */
function mount(client: WorkspaceClient, open = true) {
  const latest: { current: SpecWriter | null } = { current: null };
  const written: SpecResponse[] = [];
  function Host(props: { open: boolean }) {
    latest.current = useSpecWriter({
      client,
      open: props.open,
      onWritten: (spec) => written.push(spec),
    });
    return null;
  }
  const rendered = render(createElement(Host, { open }));
  return {
    latest: () => latest.current as SpecWriter,
    written,
    // Two steps: the render (a prop change) and a flush for the passive effect it schedules,
    // which happy-dom does not settle inside a single synchronous act().
    setOpen: async (next: boolean) => {
      rendered.update(createElement(Host, { open: next }));
      await act(async () => {
        await Promise.resolve();
      });
    },
    unmount: rendered.unmount,
  };
}

describe("useSpecWriter", () => {
  it("is busy while the call is in flight and idle with the fields shown once it resolves", async () => {
    const { promise, resolve } = deferred<SpecResponse>();
    const host = mount(stubClient(() => promise));

    act(() => host.latest().write("r1", { prompt: "add a retry budget" }));
    expect(host.latest().busy).toBe(true);
    expect(host.latest().error).toBeNull();

    await act(async () => {
      resolve(SPEC);
      await promise;
    });

    expect(host.latest().busy).toBe(false);
    expect(host.latest().writtenBy).toBe(SPEC.profileId);
    expect(host.latest().shown).toBe(true);
    expect(host.written).toEqual([SPEC]);
    host.unmount();
  });

  it("exposes the message and hint of a 409 and leaves the dialog usable", async () => {
    const failure = new ApiError("no subscription-billed agent can write specs on this machine", {
      code: "spec-writer-unavailable",
      hint: "Write the spec yourself in the dialog.",
      status: 409,
    });
    const host = mount(stubClient(() => Promise.reject(failure)));

    await act(async () => {
      host.latest().write("r1", { prompt: "add a retry budget" });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.latest().busy).toBe(false);
    expect(host.latest().error).toBe(failure);
    expect(host.latest().error?.hint).toBe("Write the spec yourself in the dialog.");
    expect(host.latest().writtenBy).toBeNull();
    expect(host.latest().shown).toBe(true);
    host.unmount();
  });

  it("exposes the message and hint of a 502 the same way", async () => {
    const failure = new ApiError("claude exited with code 3", {
      code: "spec-writer-failed",
      hint: "Write the spec yourself, or run `claude -p` in the repo to see why.",
      status: 502,
    });
    const host = mount(stubClient(() => Promise.reject(failure)));

    await act(async () => {
      host.latest().write("r1", { prompt: "add a retry budget" });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.latest().error).toBe(failure);
    expect(host.latest().error?.hint).toContain("Write the spec yourself");
    expect(host.latest().writtenBy).toBeNull();
    expect(host.latest().shown).toBe(true);
    host.unmount();
  });

  it("resets to idle when the dialog reopens", async () => {
    const host = mount(stubClient(() => Promise.resolve(SPEC)));
    await act(async () => {
      host.latest().write("r1", { prompt: "add a retry budget" });
      await Promise.resolve();
    });
    expect(host.latest().writtenBy).toBe(SPEC.profileId);

    await host.setOpen(false);
    await host.setOpen(true);

    expect(host.latest()).toMatchObject({
      busy: false,
      error: null,
      writtenBy: null,
      shown: false,
    });
    host.unmount();
  });

  it("drops an answer that arrives after the dialog closed and reopened", async () => {
    const { promise, resolve } = deferred<SpecResponse>();
    const host = mount(stubClient(() => promise));
    act(() => host.latest().write("r1", { prompt: "add a retry budget" }));

    await host.setOpen(false);
    await host.setOpen(true);
    await act(async () => {
      resolve(SPEC);
      await promise;
    });

    expect(host.latest()).toMatchObject({ busy: false, writtenBy: null, shown: false });
    expect(host.written).toEqual([]);
    host.unmount();
  });

  it("keeps the first attribution when a second write fails and its text stays", async () => {
    const failure = new ApiError("claude exited with code 3", {
      code: "spec-writer-failed",
      hint: "Write the spec yourself.",
      status: 502,
    });
    let calls = 0;
    const host = mount(
      stubClient(() => (calls++ === 0 ? Promise.resolve(SPEC) : Promise.reject(failure))),
    );
    await act(async () => {
      host.latest().write("r1", { prompt: "add a retry budget" });
      await Promise.resolve();
    });

    await act(async () => {
      host.latest().write("r1", { prompt: "add a flag" });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.latest().error).toBe(failure);
    expect(host.latest().writtenBy).toBe(SPEC.profileId);
    host.unmount();
  });

  it("replaces the fields when Write spec is pressed a second time", async () => {
    let calls = 0;
    const host = mount(stubClient(() => Promise.resolve(calls++ === 0 ? SPEC : OTHER_SPEC)));
    await act(async () => {
      host.latest().write("r1", { prompt: "add a retry budget" });
      await Promise.resolve();
    });
    expect(host.latest().writtenBy).toBe(SPEC.profileId);

    await act(async () => {
      host.latest().write("r1", { prompt: "add a flag" });
      await Promise.resolve();
    });

    expect(host.latest().writtenBy).toBe(OTHER_SPEC.profileId);
    expect(host.written).toEqual([SPEC, OTHER_SPEC]);
    host.unmount();
  });

  it("ignores a second write in the same tick as the first", () => {
    let calls = 0;
    const host = mount(
      stubClient(() => {
        calls++;
        return new Promise<SpecResponse>(() => undefined);
      }),
    );

    act(() => {
      host.latest().write("r1", { prompt: "add a retry budget" });
      host.latest().write("r1", { prompt: "add a retry budget" });
    });

    expect(calls).toBe(1);
    expect(host.latest().busy).toBe(true);
    host.unmount();
  });

  it("shows the fields with no attribution when the user asks to write it themselves", () => {
    const host = mount(stubClient(() => new Promise(() => undefined)));
    expect(host.latest().shown).toBe(false);

    act(() => host.latest().show());

    expect(host.latest().shown).toBe(true);
    expect(host.latest().writtenBy).toBeNull();
    host.unmount();
  });
});
