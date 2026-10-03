import type { Profile, RepoListRow } from "@agnostic/core";
import type { WorkspaceClient } from "../api/client";

/** One repo, two profiles and a client that answers nothing: what a component test needs to render. */
export const REPO: RepoListRow = {
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

/** The same profile billed by the token, for the tests that put the budget note in front of it. */
export const KEYED_PROFILE: Profile = {
  ...PROFILE,
  id: "claude-code:opus:openrouter",
  billing: "api-key",
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
    updateTask: () => Promise.reject(new Error("unused")),
    askCommit: () => Promise.reject(new Error("unused")),
    syncRepo: () => Promise.reject(new Error("unused")),
    compare: () => Promise.reject(new Error("unused")),
    pickCompare: () => Promise.reject(new Error("unused")),
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
export function setValue(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(prototype.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Radix portals a dialog and a select's list to `document.body`, so buttons are found there. */
export function button(label: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).find(
    (one) => one.textContent === label,
  );
  if (found === undefined) {
    throw new Error(`no "${label}" button`);
  }
  return found;
}

/** The button whose label holds `text`: the ones that carry a mark or a count beside the words. */
export function buttonWith(text: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).find((one) =>
    one.textContent?.includes(text),
  );
  if (found === undefined) {
    throw new Error(`no button reading "${text}"`);
  }
  return found;
}
