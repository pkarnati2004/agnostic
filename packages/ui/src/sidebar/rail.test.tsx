// @vitest-environment happy-dom
import type { RepoListRow, TaskListRow } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { taskRow } from "../changes/changes-fixture";
import { TooltipProvider } from "../components/tooltip";
import { click, render } from "../test/render";
import { groupTasks } from "./group-tasks";
import { Rail } from "./rail";

const PETAL: RepoListRow = {
  id: "repo1",
  name: "petal",
  path: "/tmp/petal",
  kind: "git",
  addedAt: "2026-09-01T00:00:00.000Z",
  status: "active",
  testCommand: null,
  pathPresent: true,
};

const KATHA: RepoListRow = { ...PETAL, id: "repo2", name: "katha", path: "/tmp/katha" };

const CLOSED: RepoListRow = { ...PETAL, id: "repo3", name: "zed", status: "archived" };

function rail(tasks: TaskListRow[], repos: RepoListRow[] = [PETAL, KATHA, CLOSED]) {
  const on = {
    onToggle: vi.fn(),
    onNewTask: vi.fn(),
    onSearch: vi.fn(),
    onSelect: vi.fn(),
    onSettings: vi.fn(),
  };
  return {
    ...on,
    ...render(
      <TooltipProvider>
        <Rail
          groups={groupTasks(repos, tasks)}
          daemon={{ version: "1.2.0", connection: "live" }}
          {...on}
        />
      </TooltipProvider>,
    ),
  };
}

function square(container: HTMLElement, label: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (found === null) {
    throw new Error(`no "${label}" square`);
  }
  return found;
}

describe("Rail", () => {
  it("draws one initial per active repo, and none for a closed one", () => {
    const { container, unmount } = rail([]);
    expect(square(container, "katha").textContent).toBe("k");
    expect(square(container, "petal").textContent).toBe("p");
    expect(container.querySelector('button[aria-label="zed"]')).toBeNull();
    unmount();
  });

  it("takes the initial from the whole name, not from each word", () => {
    const TWO_WORD: RepoListRow = { ...PETAL, id: "repo4", name: "invite links" };
    const { container, unmount } = rail([], [TWO_WORD]);
    expect(square(container, "invite links").textContent).toBe("i");
    unmount();
  });

  it("badges a repo with the worst thing happening in it", () => {
    const { container, unmount } = rail([
      taskRow({ id: "t1", repoId: "repo1", status: "waiting" }),
      taskRow({ id: "t2", repoId: "repo2", status: "failed" }),
    ]);
    expect(square(container, "petal").getAttribute("data-badge")).toBe("waiting");
    expect(square(container, "katha").getAttribute("data-badge")).toBe("failed");
    unmount();
  });

  it("opens the oldest question from the Needs-you square", () => {
    const { container, onSelect, unmount } = rail([
      taskRow({
        id: "new",
        repoId: "repo1",
        status: "waiting",
        updatedAt: "2026-09-20T10:00:00.000Z",
      }),
      taskRow({
        id: "old",
        repoId: "repo1",
        status: "waiting",
        updatedAt: "2026-09-20T09:40:00.000Z",
      }),
    ]);
    click(square(container, "2 waiting for you"));
    expect(onSelect).toHaveBeenCalledWith("old");
    unmount();
  });

  it("leaves the Needs-you square out while nothing waits", () => {
    const { container, unmount } = rail([taskRow({ id: "t1", repoId: "repo1" })]);
    expect(container.querySelector('button[aria-label="1 waiting for you"]')).toBeNull();
    unmount();
  });

  it("opens Settings from the gear over the daemon's dot", () => {
    const { container, onSettings, unmount } = rail([]);
    click(square(container, "Settings"));
    expect(onSettings).toHaveBeenCalledOnce();
    unmount();
  });

  it("opens the sidebar from a repo's square: the rail names repos, it does not list tasks", () => {
    const { container, onToggle, unmount } = rail([]);
    click(square(container, "petal"));
    expect(onToggle).toHaveBeenCalledOnce();
    unmount();
  });
});
