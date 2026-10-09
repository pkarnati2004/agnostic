// @vitest-environment happy-dom
import type { RepoListRow, TaskListRow } from "@agnostic/core";
import { act, useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./api/error";
import { Centre } from "./centre";
import { taskRow } from "./changes/changes-fixture";
import { TooltipProvider } from "./components/tooltip";
import type { ConnectionState } from "./store/workspace-state";
import type { TabsState } from "./tabs/tabs-state";
import { render } from "./test/render";
import { setValue, stubClient, WithRowActions } from "./test/workspace-fixture";
import { IDLE_USAGE } from "./usage/usage-state";

// TerminalView owns a real xterm terminal and a tmux socket, neither of which happy-dom can run.
// A DOM test stands a bare marker in its place and counts how many times React mounts one, which
// is the fact this suite is about: a hidden tab keeps its terminal (task-tabs.tsx), so opening and
// leaving the Compare tab must never remount the ones behind it.
const mounted = vi.hoisted(() => ({ ids: [] as string[] }));

vi.mock("./terminal/terminal-view", () => ({
  TerminalView: (props: { task: { id: string }; active: boolean }) => {
    useEffect(() => {
      mounted.ids.push(props.task.id);
      // Only ever runs again if React remounts this element under a new key (task.id), which is
      // exactly the event this suite is watching for.
    }, [props.task.id]);
    return <div data-testid={`terminal-${props.task.id}`} data-active={String(props.active)} />;
  },
}));

const NOW = Date.parse("2026-09-24T10:00:00.000Z");

const TASK1 = taskRow({ id: "task1", title: "Add the retry budget" });
const TASK2 = taskRow({ id: "task2", title: "Port the parser to zod" });
const SIB_A = taskRow({ id: "sib-a", compareId: "cmp1", title: "Try two parsers" });
const SIB_B = taskRow({
  id: "sib-b",
  compareId: "cmp1",
  title: "Try two parsers",
  profileId: "codex:gpt-5-codex:native",
});

const TASKS: Record<string, TaskListRow> = {
  task1: TASK1,
  task2: TASK2,
  "sib-a": SIB_A,
  "sib-b": SIB_B,
};

type Extra = {
  loaded?: boolean;
  connection?: ConnectionState;
  error?: ApiError | null;
  onRetry?: () => void;
  repos?: RepoListRow[];
};

function centre(tabs: TabsState, extra: Extra = {}) {
  return (
    <TooltipProvider>
      <WithRowActions>
        <Centre
          tabs={tabs}
          dispatchTabs={vi.fn()}
          repos={extra.repos ?? []}
          tasks={TASKS}
          config={null}
          loaded={extra.loaded ?? true}
          profiles={[]}
          token="tok"
          client={stubClient({ compare: () => new Promise(() => undefined) })}
          usage={IDLE_USAGE}
          budget={null}
          taskUsage={null}
          refreshUsage={vi.fn()}
          files={null}
          error={extra.error ?? null}
          connection={extra.connection ?? "live"}
          onRetry={extra.onRetry ?? vi.fn()}
          now={NOW}
          resumed={null}
          notices={{}}
          changesOpen={false}
          onToggleChanges={vi.fn()}
          onResume={() => Promise.resolve()}
          onStop={() => Promise.resolve()}
          onHandoff={() => Promise.resolve(true)}
          flash={0}
          handoffFor={null}
          onHandoffFor={vi.fn()}
          onNewTask={vi.fn()}
          defaultRepoId={null}
          seed={null}
          onStarted={vi.fn()}
          onAddRepo={vi.fn()}
          usageStamp={{ plans: 0, byTask: {} }}
          onPick={() => Promise.resolve(null)}
        />
      </WithRowActions>
    </TooltipProvider>
  );
}

function activeOf(container: HTMLElement, taskId: string): string | null {
  return (
    container.querySelector(`[data-testid="terminal-${taskId}"]`)?.getAttribute("data-active") ??
    null
  );
}

describe("Centre with nothing in front", () => {
  it("asks what to work on, rather than pointing at the sidebar", () => {
    const { container, unmount } = render(centre({ open: [], active: null }));

    expect(container.textContent).toContain("What should an agent work on?");
    unmount();
  });

  it("says where the page got to while it is still loading", () => {
    const { container, unmount } = render(centre({ open: [], active: null }, { loaded: false }));

    expect(container.textContent).toContain("Loading the workspace…");
    expect(container.textContent).not.toContain("What should an agent work on?");
    unmount();
  });

  it("draws the composer in its own tab, under no heading", () => {
    const { container, unmount } = render(centre({ open: ["new-task"], active: "new-task" }));

    expect(container.textContent).not.toContain("What should an agent work on?");
    expect(container.querySelector("#new-task-prompt")).not.toBeNull();
    unmount();
  });
});

describe("Centre and the Compare tab", () => {
  it("keeps every TerminalView mounted while the Compare tab is in front, and back again", () => {
    mounted.ids.length = 0;
    const open = ["task1", "task2", "compare:cmp1"];
    const { container, update, unmount } = render(centre({ open, active: "task1" }));
    expect(mounted.ids.sort()).toEqual(["task1", "task2"]);
    expect(activeOf(container, "task1")).toBe("true");
    expect(activeOf(container, "task2")).toBe("false");

    update(centre({ open, active: "compare:cmp1" }));
    expect(mounted.ids.sort()).toEqual(["task1", "task2"]); // no new mount for the switch
    expect(container.textContent).toContain("Loading the compare…");
    expect(activeOf(container, "task1")).toBe("false");
    expect(activeOf(container, "task2")).toBe("false");

    update(centre({ open, active: "task1" }));
    expect(mounted.ids.sort()).toEqual(["task1", "task2"]); // and none for the switch back
    expect(activeOf(container, "task1")).toBe("true");
    unmount();
  });
});

describe("Centre and the New task tab's draft", () => {
  const repo: RepoListRow = {
    id: "r1",
    path: "/repo",
    kind: "git",
    name: "petal",
    addedAt: "2026-09-14T10:00:00.000Z",
    status: "active",
    testCommand: null,
    pathPresent: true,
  };

  function typedPrompt(): string {
    return (document.getElementById("new-task-prompt") as HTMLTextAreaElement).value;
  }

  function type(container: HTMLElement, text: string): void {
    setValue(container.querySelector("#new-task-prompt") as HTMLTextAreaElement, text);
  }

  it("keeps what was typed across a switch to a task tab and back", () => {
    const open = ["new-task", "task1"];
    const { container, update, unmount } = render(
      centre({ open, active: "new-task" }, { repos: [repo] }),
    );
    type(container, "port the parser");
    expect(typedPrompt()).toBe("port the parser");

    // The tab is still open, so it stays mounted and hidden rather than coming down.
    update(centre({ open, active: "task1" }, { repos: [repo] }));
    const box = container.querySelector("#new-task-prompt") as HTMLTextAreaElement;
    expect(box.closest("[hidden]")).not.toBeNull();
    expect(box.value).toBe("port the parser");

    update(centre({ open, active: "new-task" }, { repos: [repo] }));
    expect(typedPrompt()).toBe("port the parser");
    unmount();
  });

  it("drops what was typed when the tab is closed", () => {
    const { container, update, unmount } = render(
      centre({ open: ["new-task", "task1"], active: "new-task" }, { repos: [repo] }),
    );
    type(container, "port the parser");

    // Closing the tab: it leaves `open` and the centre stops drawing NewTaskTab at all.
    update(centre({ open: ["task1"], active: "task1" }, { repos: [repo] }));
    expect(container.querySelector("#new-task-prompt")).toBeNull();

    update(centre({ open: ["new-task", "task1"], active: "new-task" }, { repos: [repo] }));
    expect(typedPrompt()).toBe("");
    unmount();
  });
});

describe("Centre and a daemon that stopped answering", () => {
  // A restart that comes back inside the feed's own retry is not worth a banner (handoff pick 1).
  it("waits three seconds of reconnecting before it says the daemon is down", () => {
    vi.useFakeTimers();
    try {
      const open = ["task1"];
      const live = render(centre({ open, active: "task1" }));
      expect(live.container.textContent).not.toContain("agnd is not running");

      live.update(centre({ open, active: "task1" }, { connection: "reconnecting" }));
      expect(live.container.textContent).not.toContain("agnd is not running");

      act(() => {
        vi.advanceTimersByTime(3_000);
      });
      expect(live.container.textContent).toContain("agnd is not running");

      live.update(centre({ open, active: "task1" }, { connection: "live" }));
      expect(live.container.textContent).not.toContain("agnd is not running");
      live.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("says so at once when the page never loaded at all", () => {
    const error = new ApiError("the agn daemon is not answering on this page", {
      code: "daemon-unreachable",
      hint: "Run `agn daemon start`.",
      status: null,
    });
    const { container, unmount } = render(
      centre({ open: [], active: null }, { loaded: false, error, connection: "connecting" }),
    );
    expect(container.textContent).toContain("agnd is not running");
    // One line about it, not two: the banner already names the command and offers Retry.
    expect(container.textContent).not.toContain("not answering on this page");
    unmount();
  });

  it("shows a bootstrap failure the daemon did answer as a notice, not as the banner", () => {
    const error = new ApiError("the token in this page's address is not the daemon's", {
      code: "unauthorized",
      hint: "Open the workspace with `agn ui`.",
      status: 401,
    });
    const { container, unmount } = render(
      centre({ open: [], active: null }, { loaded: false, error }),
    );
    expect(container.textContent).toContain("the token in this page's address is not the daemon's");
    expect(container.textContent).not.toContain("agnd is not running");
    unmount();
  });
});
