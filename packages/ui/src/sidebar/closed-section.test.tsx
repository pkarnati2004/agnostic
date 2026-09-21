// @vitest-environment happy-dom
import type { RepoListRow } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/error";
import { TooltipProvider } from "../components/tooltip";
import type { RepoNotices } from "../repo/repo-notices";
import { click, render } from "../test/render";
import { ClosedSection } from "./closed-section";

const PETAL: RepoListRow = {
  id: "r1",
  name: "petal",
  path: "/Users/dev/petal",
  kind: "git",
  addedAt: "2026-09-01T00:00:00.000Z",
  status: "archived",
  testCommand: null,
  pathPresent: true,
};

const KATHA: RepoListRow = { ...PETAL, id: "r2", name: "katha", path: "/Users/dev/katha" };

function section(props: { repos: RepoListRow[]; expanded: boolean; notices?: RepoNotices }) {
  const onReopen = vi.fn(() => Promise.resolve());
  const onRemove = vi.fn();
  const onToggle = vi.fn();
  const page = render(
    <TooltipProvider>
      <ClosedSection
        repos={props.repos}
        expanded={props.expanded}
        onToggle={onToggle}
        onReopen={onReopen}
        onRemove={onRemove}
        notices={props.notices ?? {}}
      />
    </TooltipProvider>,
  );
  return { ...page, onReopen, onRemove, onToggle };
}

function buttonSaying(container: HTMLElement, text: string): Element {
  const found = Array.from(container.querySelectorAll("button")).find((button) =>
    (button.textContent ?? "").startsWith(text),
  );
  if (found === undefined) {
    throw new Error(`no button saying "${text}"`);
  }
  return found;
}

describe("ClosedSection", () => {
  it("counts the closed repos and lists none until it is opened", () => {
    const page = section({ repos: [PETAL, KATHA], expanded: false });
    expect(page.container.textContent).toContain("Closed (2)");
    expect(page.container.textContent).not.toContain("/Users/dev/petal");

    click(buttonSaying(page.container, "Closed (2)"));
    expect(page.onToggle).toHaveBeenCalledTimes(1);
    page.unmount();
  });

  it("lists one row per repo with its path and a Reopen, and says the history is kept", () => {
    const page = section({ repos: [PETAL, KATHA], expanded: true });
    expect(page.container.textContent).toContain(
      "A closed repo is hidden here. Its usage and outcome history is kept.",
    );
    expect(page.container.textContent).toContain("/Users/dev/petal");
    expect(page.container.textContent).toContain("/Users/dev/katha");

    click(buttonSaying(page.container, "Reopen"));
    expect(page.onReopen).toHaveBeenCalledWith("r1");
    page.unmount();
  });

  it("offers Remove on every row, for the repo the click was on", () => {
    const page = section({ repos: [PETAL, KATHA], expanded: true });
    expect(page.container.querySelectorAll("button")).toHaveLength(5);
    click(buttonSaying(page.container, "Remove"));
    expect(page.onRemove).toHaveBeenCalledWith("r1");
    expect(page.onReopen).not.toHaveBeenCalled();
    page.unmount();
  });

  it("says when a closed repo's folder is not where agn left it", () => {
    const page = section({ repos: [{ ...PETAL, pathPresent: false }, KATHA], expanded: true });
    expect(page.container.textContent).toContain("/Users/dev/petal (not found)");
    expect(page.container.textContent).toContain("/Users/dev/katha");
    expect(page.container.textContent).not.toContain("/Users/dev/katha (not found)");
    page.unmount();
  });

  it("is not there at all when no repo is closed", () => {
    const page = section({ repos: [], expanded: true });
    expect(page.container.textContent).toBe("");
    page.unmount();
  });

  it("draws a refused reopen in the row that asked for it", () => {
    const notices: RepoNotices = {
      r2: {
        action: "reopen",
        at: 1000,
        error: new ApiError("no repo matches r2", { code: "not-found", status: 404 }),
      },
    };
    const page = section({ repos: [PETAL, KATHA], expanded: true, notices });
    const alert = page.container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Reopen failed for katha: no repo matches r2");
    page.unmount();
  });
});
