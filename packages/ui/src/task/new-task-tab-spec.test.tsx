// @vitest-environment happy-dom
// The spec-step story for NewTaskTab; the shared helpers live in new-task-tab-fixture.tsx.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/error";
import { button, buttonWith, PROFILE, REPO, stubClient } from "../test/workspace-fixture";
import {
  arrow,
  flipSpecSwitch,
  press,
  prompt,
  recommendation,
  SPEC,
  STARTED,
  tab,
  type,
} from "./new-task-tab-fixture";

const REFUSED = new ApiError("no subscription-billed agent can write specs on this machine", {
  code: "spec-writer-unavailable",
  hint: "Write the spec yourself.",
  status: 409,
});

function specField(id: string): HTMLTextAreaElement {
  return document.getElementById(id) as HTMLTextAreaElement;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("NewTaskTab with the spec switch on", () => {
  it("writes the spec first and stops at the step, with the answer in the fields", async () => {
    const asked: { repoId: string; body: unknown }[] = [];
    const { container, unmount } = tab(
      stubClient({
        recommend: () => Promise.resolve(recommendation(PROFILE.id)),
        writeSpec: (repoId, body) => {
          asked.push({ repoId, body });
          return Promise.resolve(SPEC);
        },
      }),
    );
    await type();
    flipSpecSwitch(container);
    await press(arrow());

    expect(asked).toEqual([{ repoId: REPO.id, body: { prompt: "add a retry budget" } }]);
    expect(specField("new-task-spec").value).toBe(SPEC.spec);
    // The harness and the model, not the profile id the daemon answered with.
    expect(container.textContent).toContain("Written by claude-code · opus");
    expect(container.textContent).not.toContain(PROFILE.id);
    unmount();
  });

  it("carries the approved title, spec and acceptance into the run", async () => {
    const runs: unknown[] = [];
    const { container, unmount } = tab(
      stubClient({
        recommend: () => Promise.resolve(recommendation(PROFILE.id)),
        writeSpec: () => Promise.resolve(SPEC),
        runTask: (_repoId, body) => {
          runs.push(body);
          return Promise.resolve({ task: STARTED });
        },
      }),
    );
    await type();
    flipSpecSwitch(container);
    await press(arrow());
    await press(buttonWith("Approve and start"));

    expect(runs).toEqual([
      {
        prompt: "add a retry budget",
        profile: PROFILE.id,
        title: SPEC.title,
        spec: SPEC.spec,
        acceptance: SPEC.acceptance,
      },
    ]);
    unmount();
  });

  it("leaves out a field the user emptied before approving", async () => {
    const runs: unknown[] = [];
    const { container, unmount } = tab(
      stubClient({
        recommend: () => Promise.resolve(recommendation(PROFILE.id)),
        writeSpec: () => Promise.resolve(SPEC),
        runTask: (_repoId, body) => {
          runs.push(body);
          return Promise.resolve({ task: STARTED });
        },
      }),
    );
    await type();
    flipSpecSwitch(container);
    await press(arrow());
    const acceptance = specField("new-task-acceptance");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    act(() => {
      setter?.call(acceptance, "");
      acceptance.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await press(buttonWith("Approve and start"));

    expect(runs).toEqual([
      { prompt: "add a retry budget", profile: PROFILE.id, title: SPEC.title, spec: SPEC.spec },
    ]);
    unmount();
  });

  it("lands on the step with the daemon's words when no spec could be written", async () => {
    const { container, unmount } = tab(
      stubClient({
        recommend: () => Promise.resolve(recommendation(PROFILE.id)),
        writeSpec: () => Promise.reject(REFUSED),
      }),
    );
    await type();
    flipSpecSwitch(container);
    await press(arrow());

    expect(container.textContent).toContain("no subscription-billed agent can write specs");
    expect(specField("new-task-spec").value).toBe("");
    expect(container.textContent).toContain("Write the spec yourself.");
    unmount();
  });

  it("still lets Back return to the composer, prompt intact, after a failed write", async () => {
    const { container, unmount } = tab(
      stubClient({
        recommend: () => Promise.resolve(recommendation(PROFILE.id)),
        writeSpec: () => Promise.reject(REFUSED),
      }),
    );
    await type();
    flipSpecSwitch(container);
    await press(arrow());

    act(() => button("Back").click());

    expect(prompt()).not.toBeNull();
    expect(prompt().value).toBe("add a retry budget");
    expect(container.textContent).not.toContain("no subscription-billed agent can write specs");
    unmount();
  });

  it("asks again from Rewrite, and keeps the prompt on the way back", async () => {
    let calls = 0;
    const { container, unmount } = tab(
      stubClient({
        recommend: () => Promise.resolve(recommendation(PROFILE.id)),
        writeSpec: () => {
          calls += 1;
          return Promise.resolve({ ...SPEC, title: `Attempt ${calls}` });
        },
      }),
    );
    await type();
    flipSpecSwitch(container);
    await press(arrow());
    await press(button("Rewrite"));

    expect(calls).toBe(2);
    expect((document.getElementById("new-task-title") as HTMLInputElement).value).toBe("Attempt 2");

    act(() => button("Back").click());
    expect(prompt().value).toBe("add a retry budget");
    unmount();
  });
});
