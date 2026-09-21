// @vitest-environment happy-dom
import type { Task } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/error";
import type { TaskNotice } from "../store/task-notices";
import { render } from "../test/render";
import { HandoffDialog } from "./handoff-dialog";
import { PROFILE } from "./new-task-dialog-fixture";

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

function open(notice: TaskNotice | null, onSubmit: () => Promise<boolean>) {
  const rendered = render(
    <HandoffDialog task={TASK} profiles={[PROFILE]} notice={notice} onSubmit={onSubmit} />,
  );
  act(() => button("Hand off").click());
  const trigger = document.getElementById("handoff-profile") as HTMLButtonElement;
  act(() => trigger.click());
  const item = Array.from(document.querySelectorAll('[role="option"]')).find(
    (one) => one.textContent === PROFILE.id,
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
});
