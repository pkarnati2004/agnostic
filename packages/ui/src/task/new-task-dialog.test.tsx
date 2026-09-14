// @vitest-environment happy-dom
import type { Profile, RepoListRow } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { render } from "../test/render";
import { NewTaskDialog } from "./new-task-dialog";

// Radix portals the dialog and the select's listbox to `document.body`, outside the render
// helper's own container, so these tests query the document rather than `container`.

const REPO: RepoListRow = {
  id: "r1",
  path: "/repo",
  kind: "git",
  name: "petal",
  addedAt: "2026-09-14T10:00:00.000Z",
  testCommand: null,
};

const PROFILE: Profile = {
  id: "claude-code:opus:native",
  harness: "claude-code",
  model: "opus",
  route: "native",
  billing: "subscription",
  available: true,
  evidence: "binary",
  tier: 1,
};

function stubClient(overrides: Partial<WorkspaceClient> = {}): WorkspaceClient {
  return {
    listRepos: () => Promise.reject(new Error("unused")),
    listTasks: () => Promise.reject(new Error("unused")),
    getTask: () => Promise.reject(new Error("unused")),
    profiles: () => Promise.reject(new Error("unused")),
    stopTask: () => Promise.reject(new Error("unused")),
    resumeTask: () => Promise.reject(new Error("unused")),
    handoffTask: () => Promise.reject(new Error("unused")),
    // Never resolves: these tests care about what is sent, not the reply.
    recommend: () => new Promise(() => undefined),
    runTask: () => new Promise(() => undefined),
    events: () => (async function* () {})(),
    ...overrides,
  };
}

/** React's controlled-input setter, bypassed so the `input` event carries a real value change. */
function setValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Opens the Profile select and clicks the one profile fixture; no keyboard, no typeahead. */
function pickProfile() {
  const trigger = document.getElementById("new-task-profile") as HTMLButtonElement;
  act(() => trigger.click());
  const item = Array.from(document.querySelectorAll('[role="option"]')).find(
    (el) => el.textContent === PROFILE.id,
  ) as HTMLElement | undefined;
  act(() => item?.click());
}

function runButton(): HTMLButtonElement {
  return Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent === "Run",
  ) as HTMLButtonElement;
}

function dialog(client: WorkspaceClient) {
  return render(
    <NewTaskDialog
      open
      onOpenChange={vi.fn()}
      repos={[REPO]}
      defaultRepoId="r1"
      profiles={[PROFILE]}
      client={client}
      onStarted={vi.fn()}
    />,
  );
}

describe("NewTaskDialog", () => {
  it("enables Run only once there is a prompt and a profile", () => {
    const { unmount } = dialog(stubClient());
    expect(runButton().disabled).toBe(true);

    const textarea = document.getElementById("new-task-prompt") as HTMLTextAreaElement;
    act(() => setValue(textarea, "add a retry budget"));
    expect(runButton().disabled).toBe(true);

    pickProfile();
    expect(runButton().disabled).toBe(false);
    unmount();
  });

  it("runs on Cmd/Ctrl+Enter and leaves a plain Enter alone", () => {
    const calls: { repoId: string; body: unknown }[] = [];
    const { unmount } = dialog(
      stubClient({
        runTask: (repoId, body) => {
          calls.push({ repoId, body });
          return new Promise(() => undefined);
        },
      }),
    );
    const textarea = document.getElementById("new-task-prompt") as HTMLTextAreaElement;
    act(() => setValue(textarea, "add a retry budget"));
    pickProfile();

    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });
    expect(calls).toHaveLength(0);

    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(calls).toEqual([
      { repoId: "r1", body: { prompt: "add a retry budget", profile: PROFILE.id } },
    ]);
    unmount();
  });
});
