// @vitest-environment happy-dom
import type { BudgetReport, Profile, Task } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/error";
import type { TaskNotice } from "../store/task-notices";
import { click, render } from "../test/render";
import { HandoffDialog } from "./handoff-dialog";
import { KEYED_PROFILE, PROFILE } from "./new-task-dialog-fixture";

const OVER_BUDGET: BudgetReport = {
  day: { limitUsd: 5, spentUsd: 5.2, state: "exceeded" },
  week: null,
};

const TASK: Task = {
  id: "task1",
  repoId: "r1",
  title: "Port the parser",
  prompt: "port the parser",
  profileId: PROFILE.id,
  worktreePath: "/tmp/wt/task1",
  branch: "agn/port-the-parser",
  status: "running",
  origin: "agn",
  baseCommit: null,
  compareId: null,
  createdAt: "2026-09-14T09:00:00.000Z",
  updatedAt: "2026-09-14T10:00:00.000Z",
};

const REFUSED: TaskNotice = {
  action: "handoff",
  host: "dialog",
  error: new ApiError("codex is not installed", {
    code: "profile-unavailable",
    hint: "Run `agn doctor`.",
    status: 409,
  }),
  at: 1000,
};

function button(label: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).find(
    (one) => one.textContent === label,
  );
  if (found === undefined) {
    throw new Error(`no "${label}" button`);
  }
  return found;
}

function open(
  notice: TaskNotice | null,
  onSubmit: () => Promise<boolean>,
  opts: { profiles?: Profile[]; budget?: BudgetReport | null; pick?: string } = {},
) {
  const profiles = opts.profiles ?? [PROFILE];
  const pick = opts.pick ?? PROFILE.id;
  const rendered = render(
    <HandoffDialog
      task={TASK}
      profiles={profiles}
      budget={opts.budget ?? null}
      notice={notice}
      onSubmit={onSubmit}
    />,
  );
  act(() => button("Hand off").click());
  const trigger = document.getElementById("handoff-profile") as HTMLButtonElement;
  act(() => trigger.click());
  const item = Array.from(document.querySelectorAll('[role="option"]')).find(
    (one) => one.textContent === pick,
  ) as HTMLElement | undefined;
  act(() => item?.click());
  return rendered;
}

describe("HandoffDialog", () => {
  it("stays open with the daemon's answer in it when the handoff is refused", async () => {
    const { unmount } = open(REFUSED, () => Promise.resolve(false));
    await act(async () => button("Run").click());

    expect(document.body.textContent).toContain("Hand off Port the parser");
    expect(document.body.textContent).toContain(
      "Hand off failed for Port the parser: codex is not installed",
    );
    expect(document.body.textContent).toContain("Run agn doctor.");
    expect(button("Run").disabled).toBe(false);
    unmount();
  });

  it("closes once the child has started", async () => {
    const onSubmit = vi.fn(() => Promise.resolve(true));
    const { unmount } = open(null, onSubmit);
    await act(async () => button("Run").click());

    expect(onSubmit).toHaveBeenCalledWith({ profile: PROFILE.id });
    expect(document.body.textContent).not.toContain("Hand off Port the parser");
    unmount();
  });

  it("carries the note's ignore checkbox into the posted body for an over-budget profile", async () => {
    const onSubmit = vi.fn(() => Promise.resolve(true));
    const { unmount } = open(null, onSubmit, {
      profiles: [KEYED_PROFILE],
      budget: OVER_BUDGET,
      pick: KEYED_PROFILE.id,
    });

    expect(document.body.textContent).toContain("Over budget: today $5.20 of $5.00.");
    const box = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    click(box);
    await act(async () => button("Run").click());

    expect(onSubmit).toHaveBeenCalledWith({ profile: KEYED_PROFILE.id, ignoreBudget: true });
    unmount();
  });
});
