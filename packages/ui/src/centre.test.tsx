// @vitest-environment happy-dom
import type { TaskListRow } from "@agnostic/core";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { Centre } from "./centre";
import { taskRow } from "./changes/changes-fixture";
import { TooltipProvider } from "./components/tooltip";
import type { TabsState } from "./tabs/tabs-state";
import { stubClient } from "./task/new-task-dialog-fixture";
import { render } from "./test/render";
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

function centre(tabs: TabsState) {
  return (
    <TooltipProvider>
      <Centre
        tabs={tabs}
        dispatchTabs={vi.fn()}
        repos={[]}
        tasks={TASKS}
        loaded={true}
        profiles={[]}
        token="tok"
        client={stubClient({ compare: () => new Promise(() => undefined) })}
        usage={IDLE_USAGE}
        cost={null}
        error={null}
        resumed={null}
        notices={{}}
        changesOpen={false}
        onToggleChanges={vi.fn()}
        onDismiss={vi.fn()}
        onResume={() => Promise.resolve()}
        onStop={() => Promise.resolve()}
        onHandoff={() => Promise.resolve(true)}
        usageStamp={{ plans: 0, byTask: {} }}
        onPick={() => Promise.resolve(null)}
      />
    </TooltipProvider>
  );
}

function activeOf(container: HTMLElement, taskId: string): string | null {
  return (
    container.querySelector(`[data-testid="terminal-${taskId}"]`)?.getAttribute("data-active") ??
    null
  );
}

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
