// @vitest-environment happy-dom
import type { AskCommitResponse, ChangesResponse, TaskListRow } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { TooltipProvider } from "../components/tooltip";
import { stubClient } from "../task/new-task-dialog-fixture";
import { click, render } from "../test/render";
import { changesResponse, FILES, taskRow } from "./changes-fixture";
import { ChangesPanel } from "./changes-panel";

const LABEL = "Ask the agent to commit";

function panelClient(read: Partial<ChangesResponse>): WorkspaceClient {
  return stubClient({
    changes: () => Promise.resolve(changesResponse(read)),
    diff: () => Promise.resolve({ patch: "" }),
    editors: () => Promise.resolve({ editors: [], default: null }),
  });
}

function response(): AskCommitResponse {
  return { task: taskRow(), via: "live", prompt: "Commit your work on `agn/invite-links-a1b2`." };
}

async function panel(opts: {
  read: Partial<ChangesResponse>;
  task?: TaskListRow;
  onAskCommit?: () => Promise<AskCommitResponse | null>;
}) {
  const view = render(
    <TooltipProvider delayDuration={0}>
      <ChangesPanel
        task={opts.task ?? taskRow()}
        client={panelClient(opts.read)}
        notice={null}
        onOpen={() => Promise.resolve()}
        onCreatePr={() => Promise.resolve(null)}
        onUpdate={() => Promise.resolve(null)}
        onAskCommit={opts.onAskCommit ?? (() => Promise.resolve(null))}
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

describe("Ask the agent to commit", () => {
  it("is enabled with the tooltip naming the branch and the repo's file", async () => {
    const { container, unmount } = await panel({ read: {} });
    const control = button(container, LABEL);
    expect(control.disabled).toBe(false);
    await hover(control.parentElement ?? control);
    expect(document.body.textContent).toContain(
      "Sends the agent a prompt to commit its work on `agn/invite-links-a1b2`",
    );
    expect(document.body.textContent).toContain(".ag/prompts/commit.md");
    expect(document.body.textContent).toContain("agn runs no git command itself");
    unmount();
  });

  it("is disabled with its own text when there is nothing uncommitted", async () => {
    const committed = FILES.map((file) => ({ ...file, state: "committed" as const }));
    const { container, unmount } = await panel({ read: { files: committed, uncommitted: 0 } });
    const control = button(container, LABEL);
    expect(control.disabled).toBe(true);
    await hover(control.parentElement ?? control);
    expect(document.body.textContent).toContain(
      "Nothing to commit: the working tree is clean. The files listed are the branch's commits against main.",
    );
    unmount();
  });

  it("names no file list in that text when the branch has nothing on it", async () => {
    const { container, unmount } = await panel({ read: { files: [], uncommitted: 0 } });
    const control = button(container, LABEL);
    expect(control.disabled).toBe(true);
    await hover(control.parentElement ?? control);
    expect(document.body.textContent).toContain("Nothing to commit: the working tree is clean.");
    expect(document.body.textContent).not.toContain("The files listed");
    unmount();
  });

  it("is disabled with the Resume-first text once the worktree was cleaned", async () => {
    const cleaned = taskRow({ status: "stopped", worktreePresent: false });
    const { container, unmount } = await panel({ read: {}, task: cleaned });
    const control = button(container, LABEL);
    expect(control.disabled).toBe(true);
    await hover(control.parentElement ?? control);
    expect(document.body.textContent).toContain("Resume first: the worktree was cleaned");
    unmount();
  });

  it("asks once per click, holds the row while it waits, and draws what came back", async () => {
    let settle: (response: AskCommitResponse) => void = () => undefined;
    const onAskCommit = vi.fn(
      () =>
        new Promise<AskCommitResponse | null>((resolve) => {
          settle = resolve;
        }),
    );
    const { container, unmount } = await panel({ read: {}, onAskCommit });
    await act(async () => {
      click(button(container, LABEL));
      await Promise.resolve();
    });
    expect(onAskCommit).toHaveBeenCalledTimes(1);
    expect(button(container, LABEL).disabled).toBe(true);
    expect(button(container, "Bring up to date").disabled).toBe(true);

    await act(async () => {
      settle(response());
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Asked the agent to commit in its session.");
    unmount();
  });
});
