// @vitest-environment happy-dom
import type { CompareResponse } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { ApiError } from "../api/error";
import { taskRow } from "../changes/changes-fixture";
import { TooltipProvider } from "../components/tooltip";
import type { TaskNotice } from "../store/task-notices";
import type { UsageStamp } from "../store/workspace-state";
import { click, render } from "../test/render";
import { stubClient } from "../test/workspace-fixture";
import { compareResponse, compareRow } from "./compare-fixture";
import { CompareView } from "./compare-view";

const SIBLINGS = [
  taskRow({ id: "task1", compareId: "cmp1" }),
  taskRow({ id: "task2", compareId: "cmp1" }),
];

const STAMP = { plans: 0, byTask: {} };

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (one) => one.textContent?.trim() === label,
  );
  if (found === undefined) {
    throw new Error(`no button reads "${label}"`);
  }
  return found;
}

/** Radix portals the dialog to `document.body`, outside the render helper's own container. */
function dialog(): HTMLElement {
  const content = document.querySelector<HTMLElement>("[data-slot='dialog-content']");
  if (content === null) {
    throw new Error("no dialog is open");
  }
  return content;
}

async function view(
  over: {
    client?: Partial<WorkspaceClient>;
    notice?: TaskNotice | null;
    onPick?: (compareId: string, taskId: string) => Promise<null>;
    onOpenTask?: (taskId: string) => void;
  } = {},
) {
  const client = stubClient({
    compare: () => Promise.resolve(compareResponse()),
    ...over.client,
  });
  const onPick = over.onPick ?? vi.fn(() => Promise.resolve(null));
  const onOpenTask = over.onOpenTask ?? vi.fn();
  const rendered = render(
    <TooltipProvider>
      <CompareView
        compareId="cmp1"
        siblings={SIBLINGS}
        client={client}
        notice={over.notice ?? null}
        usageStamp={STAMP}
        onOpenTask={onOpenTask}
        onPick={onPick}
      />
    </TooltipProvider>,
  );
  await act(async () => undefined);
  return { ...rendered, onPick, onOpenTask };
}

describe("CompareView", () => {
  it("says it is loading until the first body arrives", async () => {
    const pending = render(
      <TooltipProvider>
        <CompareView
          compareId="cmp1"
          siblings={SIBLINGS}
          client={stubClient({ compare: () => new Promise(() => undefined) })}
          notice={null}
          usageStamp={STAMP}
          onOpenTask={vi.fn()}
          onPick={vi.fn(() => Promise.resolve(null))}
        />
      </TooltipProvider>,
    );
    expect(pending.container.textContent).toContain("Loading the compare…");
    pending.unmount();
  });

  it("draws the header and one column per agent, with every cell", async () => {
    const { container, unmount } = await view();
    expect(container.textContent).toContain("Add the invite links");
    expect(container.textContent).toContain("add invite links");
    expect(container.textContent).toContain("2 agents");
    const columns = container.querySelectorAll("section");
    expect(columns).toHaveLength(2);
    const first = columns[0]?.textContent ?? "";
    // The chip carries the harness, the model and what the profile costs; the whole id is its title.
    expect(first).toContain("claude-code · sonnet-4.5");
    expect(columns[0]?.querySelector('[title="claude-code:sonnet-4.5:native"]')).not.toBeNull();
    expect(first).toContain("Running");
    expect(first).toContain("3");
    expect(first).toContain("+42 -7");
    expect(container.querySelectorAll("dd")).toHaveLength(10);
    unmount();
  });

  it("says what a plan absorbed and what git could not count", async () => {
    const response = compareResponse({
      tasks: [compareRow({ billing: "subscription", changes: null })],
    });
    const { container, unmount } = await view({
      client: { compare: () => Promise.resolve(response) },
    });
    const cells = [...container.querySelectorAll("dd")].map((cell) => cell.textContent);
    expect(cells.slice(0, 2)).toEqual(["-", "-"]);
    expect(cells).toContain("in plan");
    unmount();
  });

  it("opens a sibling's own tab from its column", async () => {
    const { container, onOpenTask, unmount } = await view();
    const column = container.querySelectorAll("section")[1];
    click(button(column as HTMLElement, "Open"));
    expect(onOpenTask).toHaveBeenCalledWith("task2");
    unmount();
  });

  it("asks before a pick, names the count, and keeps one sibling", async () => {
    const onPick = vi.fn(() => Promise.resolve(null));
    const { container, unmount } = await view({ onPick });
    click(button(container.querySelectorAll("section")[0] as HTMLElement, "Pick"));
    expect(dialog().textContent).toContain("Keep claude-code:sonnet-4.5:native?");
    expect(dialog().textContent).toContain("The other 1 agent is stopped");
    click(button(dialog(), "Pick"));
    await act(async () => undefined);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("cmp1", "task1");
    unmount();
  });

  it("reads the pick dialog's count as plural for more than one other sibling", async () => {
    const four = compareResponse({
      tasks: [
        compareRow({ id: "task1" }),
        compareRow({ id: "task2", profileId: "codex:gpt-5-codex:native" }),
        compareRow({ id: "task3", profileId: "gemini-cli:pro:native" }),
        compareRow({ id: "task4", profileId: "cursor-agent:auto:native" }),
      ],
    });
    const { container, unmount } = await view({
      client: { compare: () => Promise.resolve(four) },
    });
    click(button(container.querySelectorAll("section")[0] as HTMLElement, "Pick"));
    expect(dialog().textContent).toContain(
      "The other 3 agents are stopped and their worktrees removed.",
    );
    unmount();
  });

  it("offers no Pick on the sibling a pick kept, and says what became of the rest", async () => {
    const picked: CompareResponse = compareResponse({ pickedTaskId: "task1" });
    const { container, unmount } = await view({
      client: { compare: () => Promise.resolve(picked) },
    });
    const [kept, removed] = [...container.querySelectorAll("section")];
    expect(button(kept as HTMLElement, "Pick").disabled).toBe(true);
    expect(removed?.textContent).toContain("removed · branch kept");
    unmount();
  });

  it("reads the compare again on Refresh and keeps the columns while it does", async () => {
    let reads = 0;
    const { container, unmount } = await view({
      client: {
        compare: () => {
          reads += 1;
          return Promise.resolve(compareResponse());
        },
      },
    });
    expect(reads).toBe(1);
    click(button(container, "Refresh"));
    expect(container.querySelectorAll("section")).toHaveLength(2);
    await act(async () => undefined);
    expect(reads).toBe(2);
    unmount();
  });

  it("draws a pick that failed under the header", async () => {
    const notice: TaskNotice = {
      action: "pick",
      host: "compare",
      at: 1,
      error: new ApiError("the worktree has uncommitted work", {
        code: "worktree-dirty",
        status: 409,
        hint: "Run `agn clean <task> --force`.",
      }),
    };
    const { container, unmount } = await view({ notice });
    expect(container.querySelector("[role='alert']")?.textContent).toContain(
      "Pick failed for Add the invite links: the worktree has uncommitted work",
    );
    unmount();
  });

  it("shows the daemon's refusal when there is nothing to draw", async () => {
    const failure = new ApiError('no compare matches "cmp1"', {
      code: "compare-not-found",
      status: 404,
      hint: "Run `agn compare show <id>`.",
    });
    const { container, unmount } = await view({
      client: { compare: () => Promise.reject(failure) },
    });
    expect(container.textContent).toContain('no compare matches "cmp1"');
    unmount();
  });

  it("drops an answer that arrives after the view has moved on to another compare", async () => {
    const settle: Record<string, (response: CompareResponse) => void> = {};
    const client = stubClient({
      compare: (id: string) =>
        new Promise<CompareResponse>((resolve) => {
          settle[id] = resolve;
        }),
    });
    const node = (compareId: string) => (
      <TooltipProvider>
        <CompareView
          compareId={compareId}
          siblings={SIBLINGS}
          client={client}
          notice={null}
          usageStamp={STAMP}
          onOpenTask={vi.fn()}
          onPick={vi.fn(() => Promise.resolve(null))}
        />
      </TooltipProvider>
    );
    const { container, update, unmount } = render(node("cmp1"));
    update(node("cmp2"));

    // cmp1's read lands after the view moved on to cmp2; it must not draw cmp1's title.
    await act(async () =>
      settle.cmp1?.(compareResponse({ compareId: "cmp1", title: "Stale compare" })),
    );
    expect(container.textContent).toContain("Loading the compare…");
    expect(container.textContent).not.toContain("Stale compare");

    await act(async () =>
      settle.cmp2?.(compareResponse({ compareId: "cmp2", title: "Fresh compare" })),
    );
    expect(container.textContent).toContain("Fresh compare");
    unmount();
  });

  it("reads the compare again when a sibling's usage stamp moves", async () => {
    let reads = 0;
    const client = stubClient({
      compare: () => {
        reads += 1;
        return Promise.resolve(compareResponse());
      },
    });
    const node = (usageStamp: UsageStamp) => (
      <TooltipProvider>
        <CompareView
          compareId="cmp1"
          siblings={SIBLINGS}
          client={client}
          notice={null}
          usageStamp={usageStamp}
          onOpenTask={vi.fn()}
          onPick={vi.fn(() => Promise.resolve(null))}
        />
      </TooltipProvider>
    );
    const { update, unmount } = render(node(STAMP));
    await act(async () => undefined);
    expect(reads).toBe(1);

    // A pick's usage row for one sibling lands; the view re-reads without anyone clicking Refresh.
    update(node({ plans: 0, byTask: { task1: 1 } }));
    await act(async () => undefined);
    expect(reads).toBe(2);
    unmount();
  });
});
