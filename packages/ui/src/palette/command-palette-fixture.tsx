// @vitest-environment happy-dom
import type { Recommendation, RepoListRow, RunTaskRequest } from "@agnostic/core";
import { act, useCallback, useState } from "react";
import { vi } from "vitest";
import { taskRow } from "../changes/changes-fixture";
import { render } from "../test/render";
import { CommandPalette } from "./command-palette";
import type { PaletteHandlers } from "./palette-commands";
import { usePaletteShortcut } from "./palette-shortcut";

const REPO: RepoListRow = {
  id: "repo1",
  path: "/Users/dev/petal",
  kind: "git",
  name: "petal",
  addedAt: "2026-09-01T00:00:00.000Z",
  status: "active",
  testCommand: null,
  pathPresent: true,
};

export const RECOMMENDATION: Recommendation = {
  recommended: {
    profileId: "claude-code:opus:native",
    reason: "strongest on refactors here",
    evidence: "strong",
    sources: ["outcomes"],
  },
  alternative: { profileId: "codex:gpt-5:native", reason: "cheaper, and close behind" },
  worthTrying: null,
  riskNote: null,
  taskClass: {
    intent: "refactor",
    scope: "medium",
    risk: [],
    needsBrowser: false,
    automaticIntent: null,
  },
};

export function handlers(): Omit<PaletteHandlers, "recommend"> {
  return {
    newTask: vi.fn(),
    stop: vi.fn(),
    resume: vi.fn(),
    handoff: vi.fn(),
    openInEditor: vi.fn(),
    createPr: vi.fn(),
    update: vi.fn(),
    commit: vi.fn(),
    showCost: vi.fn(),
    addRepo: vi.fn(),
    sync: vi.fn(),
  };
}

export type HarnessProps = {
  handlers: Omit<PaletteHandlers, "recommend">;
  /** Null for a page with no repo registered, where Run and Recommend have nowhere to go. */
  repo?: RepoListRow | null;
  recommend?: (repoId: string, prompt: string) => Promise<Recommendation>;
  runOn?: (repoId: string, body: RunTaskRequest) => Promise<void>;
  /** What the Changes panel last read for the task in front; null until it has read one. */
  uncommitted?: number | null;
};

/** The palette as the page wires it: the shortcut opens it, and closing it is the page's call. */
export function Harness(props: HarnessProps) {
  const [open, setOpen] = useState(false);
  usePaletteShortcut(useCallback(() => setOpen((was) => !was), []));
  return (
    <CommandPalette
      open={open}
      onOpenChange={setOpen}
      context={{
        activeTask: taskRow({ id: "task9", status: "running" }),
        repo: props.repo === undefined ? REPO : props.repo,
        uncommitted: props.uncommitted ?? null,
      }}
      handlers={props.handlers}
      recommend={props.recommend ?? (() => Promise.resolve(RECOMMENDATION))}
      runOn={props.runOn ?? (() => Promise.resolve())}
    />
  );
}

function shortcut(): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
  });
}

export function field(): HTMLInputElement {
  const found = document.querySelector<HTMLInputElement>('input[aria-label="Command"]');
  if (found === null) {
    throw new Error("the palette is not open");
  }
  return found;
}

/** React's controlled-input setter, bypassed so the `input` event carries a real value change. */
export function type(value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(field(), value);
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export function press(key: string): void {
  act(() => {
    field().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

export async function pressAwaiting(key: string): Promise<void> {
  await act(async () => {
    field().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

export function labels(): string[] {
  return Array.from(document.querySelectorAll('[role="option"]')).map(
    (row) => row.firstElementChild?.textContent ?? "",
  );
}

/** Renders the harness and opens it on the shortcut, the way every test here starts. */
export function open(props: HarnessProps): ReturnType<typeof render> {
  const page = render(<Harness {...props} />);
  shortcut();
  return page;
}
