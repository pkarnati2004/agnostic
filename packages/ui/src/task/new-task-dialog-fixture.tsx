import type { Profile, RepoListRow } from "@agnostic/core";
import { act } from "react";
import { vi } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { render } from "../test/render";
import { NewTaskDialog } from "./new-task-dialog";

// Radix portals the dialog and the select's listbox to `document.body`, outside the render helper's
// own container, so these helpers query the document rather than `container`.

const REPO: RepoListRow = {
  id: "r1",
  path: "/repo",
  kind: "git",
  name: "petal",
  addedAt: "2026-09-14T10:00:00.000Z",
  status: "active",
  testCommand: null,
  pathPresent: true,
};

export const PROFILE: Profile = {
  id: "claude-code:opus:native",
  harness: "claude-code",
  model: "opus",
  route: "native",
  billing: "subscription",
  available: true,
  evidence: "binary",
  tier: 1,
};

export function stubClient(overrides: Partial<WorkspaceClient> = {}): WorkspaceClient {
  return {
    listRepos: () => Promise.reject(new Error("unused")),
    registerRepo: () => Promise.reject(new Error("unused")),
    closeRepo: () => Promise.reject(new Error("unused")),
    openRepo: () => Promise.reject(new Error("unused")),
    removeRepo: () => Promise.reject(new Error("unused")),
    listTasks: () => Promise.reject(new Error("unused")),
    getTask: () => Promise.reject(new Error("unused")),
    profiles: () => Promise.reject(new Error("unused")),
    stopTask: () => Promise.reject(new Error("unused")),
    resumeTask: () => Promise.reject(new Error("unused")),
    handoffTask: () => Promise.reject(new Error("unused")),
    writeSpec: () => new Promise(() => undefined),
    usage: () => Promise.reject(new Error("unused")),
    taskUsage: () => Promise.reject(new Error("unused")),
    changes: () => Promise.reject(new Error("unused")),
    diff: () => Promise.reject(new Error("unused")),
    createPr: () => Promise.reject(new Error("unused")),
    editors: () => Promise.reject(new Error("unused")),
    openTask: () => Promise.reject(new Error("unused")),
    // Never resolves: these tests care about what is sent, not the reply.
    recommend: () => new Promise(() => undefined),
    runTask: () => new Promise(() => undefined),
    events: () => (async function* () {})(),
    ...overrides,
  };
}

/** React's controlled-input setter, bypassed so the `input` event carries a real value change. */
export function setValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Opens the Profile select and clicks the one profile fixture; no keyboard, no typeahead. */
export function pickProfile() {
  const trigger = document.getElementById("new-task-profile") as HTMLButtonElement;
  act(() => trigger.click());
  const item = Array.from(document.querySelectorAll('[role="option"]')).find(
    (el) => el.textContent === PROFILE.id,
  ) as HTMLElement | undefined;
  act(() => item?.click());
}

export function button(label: string): HTMLButtonElement {
  return Array.from(document.querySelectorAll("button")).find(
    (found) => found.textContent === label,
  ) as HTMLButtonElement;
}

export function runButton(): HTMLButtonElement {
  return button("Run");
}

export function dialog(client: WorkspaceClient) {
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
