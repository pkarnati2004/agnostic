// @vitest-environment happy-dom
import type { DoctorResponse } from "@agnostic/core";
import { act, createElement } from "react";
import { expect, it, vi } from "vitest";
import { ApiError } from "../api/error";
import { render } from "../test/render";
import { stubClient } from "../test/workspace-fixture";
import { doctorResponse } from "../usage/usage-response.fixture";
import { type DoctorState, useDoctor } from "./use-doctor";

/** Mounts the hook in a host that draws nothing, so a test can drive it and read its state. */
function host(doctor: () => Promise<DoctorResponse>) {
  const client = stubClient({ doctor });
  const latest: { current: DoctorState | null } = { current: null };
  let wanted = false;
  function Host({ want }: { want: boolean }) {
    latest.current = useDoctor(client, want);
    return null;
  }
  const rendered = render(createElement(Host, { want: wanted }));
  const want = (next: boolean) => {
    wanted = next;
    rendered.update(createElement(Host, { want: wanted }));
  };
  const state = () => latest.current as DoctorState;
  return { state, want, unmount: rendered.unmount };
}

const settle = () =>
  act(async () => {
    await Promise.resolve();
  });

it("asks nothing until a section that needs a detection is open", async () => {
  const doctor = vi.fn(() => Promise.resolve(doctorResponse()));
  const { want, unmount } = host(doctor);
  await settle();
  expect(doctor).not.toHaveBeenCalled();
  want(true);
  await settle();
  expect(doctor).toHaveBeenCalledWith({});
  unmount();
});

it("asks once for two sections that both want it", async () => {
  const doctor = vi.fn(() => Promise.resolve(doctorResponse()));
  const { want, unmount } = host(doctor);
  want(true);
  await settle();
  // The user leaves for Appearance and comes back: the answer is still the one it has.
  want(false);
  want(true);
  await settle();
  expect(doctor).toHaveBeenCalledTimes(1);
  unmount();
});

it("asks again on a recheck and keeps what came back", async () => {
  let version = "3.3";
  const doctor = vi.fn(() => Promise.resolve(doctorResponse({ tmux: { version, ok: true } })));
  const { state, want, unmount } = host(doctor);
  want(true);
  await settle();
  expect(state().report?.tmux.version).toBe("3.3");
  version = "3.5";
  await act(async () => {
    await state().recheck();
  });
  expect(doctor).toHaveBeenCalledTimes(2);
  expect(state().report?.tmux.version).toBe("3.5");
  unmount();
});

it("sends a plan pick as the detection's own body", async () => {
  const doctor = vi.fn(() => Promise.resolve(doctorResponse()));
  const { state, want, unmount } = host(doctor);
  want(true);
  await settle();
  await act(async () => {
    await state().setPlan("claude", "max20");
  });
  expect(doctor).toHaveBeenLastCalledWith({ plans: { claude: "max20" } });
  unmount();
});

it("keeps the daemon's message when a detection fails, and no report", async () => {
  const doctor = vi.fn(() =>
    Promise.reject(new ApiError("tmux is not installed", { code: "tmux-not-found", status: 500 })),
  );
  const { state, want, unmount } = host(doctor);
  want(true);
  await settle();
  expect(state().error).toBe("tmux is not installed");
  expect(state().report).toBeNull();
  expect(state().busy).toBe(false);
  unmount();
});
