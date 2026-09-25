import type { BudgetReport, Profile, RepoListRow, SpecResponse, Task } from "@agnostic/core";
import { act } from "react";
import { vi } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { render } from "../test/render";
import { PROFILE, REPO } from "../test/workspace-fixture";
import { NewTaskTab } from "./new-task-tab";

export const CODEX: Profile = {
  ...PROFILE,
  id: "codex:gpt-5.6:native",
  harness: "codex",
  model: "gpt-5.6",
};

export const SPEC: SpecResponse = {
  title: "Add a retry budget",
  spec: "Change the client.",
  acceptance: "the client retries",
  profileId: PROFILE.id,
  model: "opus",
};

export const STARTED = { id: "task1", title: "Add a retry budget" } as Task;

/** A pick for whichever profile the test cares about, in the shape `POST /recommend` answers with. */
export function recommendation(profileId: string) {
  return {
    recommendation: {
      recommended: { profileId, reason: "strongest here", evidence: "some" as const, sources: [] },
      alternative: null,
      worthTrying: null,
      riskNote: null,
      taskClass: {
        intent: "implement" as const,
        scope: "small" as const,
        risk: [],
        needsBrowser: false,
        automaticIntent: null,
      },
    },
  };
}

type TabOptions = {
  profiles?: Profile[];
  repos?: RepoListRow[];
  mode?: "empty" | "tab";
  seed?: { prompt: string; at: number } | null;
  budget?: BudgetReport | null;
  onStarted?: (task: Task) => void;
};

export function tab(client: WorkspaceClient, opts: TabOptions = {}) {
  const repos = opts.repos ?? [REPO];
  const draw = (seed: { prompt: string; at: number } | null) => (
    <NewTaskTab
      mode={opts.mode ?? "tab"}
      active
      repos={repos}
      defaultRepoId={repos[0]?.id ?? null}
      profiles={opts.profiles ?? [PROFILE]}
      budget={opts.budget ?? null}
      seed={seed}
      client={client}
      onStarted={opts.onStarted ?? vi.fn()}
      onAddRepo={vi.fn()}
    />
  );
  const rendered = render(draw(opts.seed ?? null));
  return {
    ...rendered,
    reseed: (seed: { prompt: string; at: number }) => rendered.update(draw(seed)),
  };
}

export function prompt(): HTMLTextAreaElement {
  return document.getElementById("new-task-prompt") as HTMLTextAreaElement;
}

export function arrow(): HTMLButtonElement {
  return document.querySelector('[aria-label="Start task"]') as HTMLButtonElement;
}

/** React's controlled-input setter, bypassed so the `input` event carries a real value change. */
function setPrompt(text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  const box = prompt();
  setter?.call(box, text);
  box.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Types a prompt and lets the debounce fire, which is how the card gets asked for. */
export async function type(text = "add a retry budget"): Promise<void> {
  act(() => setPrompt(text));
  await act(async () => {
    vi.advanceTimersByTime(400);
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Turns "Write the spec" on, which is what makes the arrow stop at the spec step. */
export function flipSpecSwitch(container: HTMLElement): void {
  act(() => (container.querySelector('[role="switch"]') as HTMLButtonElement).click());
}

/** Presses the arrow and lets the call it makes settle. */
export async function press(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}
