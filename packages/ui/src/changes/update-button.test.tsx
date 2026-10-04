// @vitest-environment happy-dom
import type { UpdateTaskResponse } from "@agnostic/core";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { TooltipProvider } from "../components/tooltip";
import { click, render } from "../test/render";
import { stubClient } from "../test/workspace-fixture";
import { changesResponse, taskRow } from "./changes-fixture";
import { ChangesPanel } from "./changes-panel";

function panelClient(over: Partial<WorkspaceClient> = {}): WorkspaceClient {
  return stubClient({
    changes: () => Promise.resolve(changesResponse()),
    diff: () => Promise.resolve({ patch: "" }),
    editors: () => Promise.resolve({ editors: [], default: null }),
    ...over,
  });
}

function response(over: Partial<UpdateTaskResponse> = {}): UpdateTaskResponse {
  return {
    task: taskRow(),
    mode: "rebase",
    via: "live",
    base: "main",
    prompt: "Fetch `main`.",
    ...over,
  };
}

async function panel(
  client: WorkspaceClient,
  onUpdate: () => Promise<UpdateTaskResponse | null>,
  task = taskRow(),
) {
  const view = render(
    <TooltipProvider delayDuration={0}>
      <ChangesPanel
        task={task}
        client={client}
        notice={null}
        onOpen={() => Promise.resolve()}
        onCreatePr={() => Promise.resolve(null)}
        onUpdate={onUpdate}
        onAskCommit={() => Promise.resolve(null)}
        onClose={vi.fn()}
        onLoaded={() => undefined}
      />
    </TooltipProvider>,
  );
  await act(async () => undefined);
  await act(async () => undefined);
  return view;
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (one) => one.textContent === label,
  );
  if (found === undefined) {
    throw new Error(`no ${label} button`);
  }
  return found;
}

/** Opens a Radix tooltip: a real hover needs the pointer events its trigger listens for. */
async function hover(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(
      new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" }),
    );
    element.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

describe("Bring up to date", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is enabled with the rebase tooltip for a branch that was never pushed", async () => {
    const { container, unmount } = await panel(panelClient(), () => Promise.resolve(null));
    const control = button(container, "Bring up to date");
    expect(control.disabled).toBe(false);
    await hover(control.parentElement ?? control);
    expect(document.body.textContent).toContain("rebase because the branch was never pushed");
    expect(document.body.textContent).toContain("agn runs no git command itself");
    unmount();
  });

  it("is enabled with the merge tooltip once the branch has been pushed", async () => {
    const client = panelClient({
      changes: () => Promise.resolve(changesResponse({ pushed: true })),
    });
    const { container, unmount } = await panel(client, () => Promise.resolve(null));
    const control = button(container, "Bring up to date");
    expect(control.disabled).toBe(false);
    await hover(control.parentElement ?? control);
    expect(document.body.textContent).toContain("merge from the base because it was pushed");
    unmount();
  });

  it("calls onUpdate once on click and shows the result line", async () => {
    const onUpdate = vi.fn(() => Promise.resolve(response()));
    const { container, unmount } = await panel(panelClient(), onUpdate);
    await act(async () => {
      click(button(container, "Bring up to date"));
      await Promise.resolve();
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Asked the agent to rebase onto `main`.");
    unmount();
  });

  it("clears the result line after 8 seconds", async () => {
    vi.useFakeTimers();
    const onUpdate = () => Promise.resolve(response());
    const { container, unmount } = await panel(panelClient(), onUpdate);
    await act(async () => {
      click(button(container, "Bring up to date"));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Asked the agent to rebase onto `main`.");
    await act(async () => {
      vi.advanceTimersByTime(8_000);
    });
    expect(container.textContent).not.toContain("Asked the agent to rebase onto `main`.");
    unmount();
  });

  it("is disabled with the Resume-first tooltip once the worktree was cleaned", async () => {
    const cleanedTask = taskRow({ worktreePresent: false, worktreePath: "/tmp/wt/task1" });
    const { container, unmount } = await panel(
      panelClient(),
      () => Promise.resolve(null),
      cleanedTask,
    );
    const control = button(container, "Bring up to date");
    expect(control.disabled).toBe(true);
    await hover(control.parentElement ?? control);
    expect(document.body.textContent).toContain("Resume first: the worktree was cleaned");
    unmount();
  });

  it("is disabled with its own text when the task has no branch", async () => {
    const noBranchTask = taskRow({ branch: null });
    const { container, unmount } = await panel(
      panelClient(),
      () => Promise.resolve(null),
      noBranchTask,
    );
    const control = button(container, "Bring up to date");
    expect(control.disabled).toBe(true);
    await hover(control.parentElement ?? control);
    expect(document.body.textContent).toContain(
      "This task works in the checkout itself, so it has no branch to update.",
    );
    unmount();
  });
});
