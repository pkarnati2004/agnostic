// @vitest-environment happy-dom
import { act, createElement } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { render } from "../test/render";
import { useWorkspaceColumns, type WorkspaceColumns } from "./workspace-columns";

type Shown = { collapsed: boolean; changesShown: boolean };

/** Wide enough that both panes reach their own maximum unless a test narrows the window. */
const WIDE_PX = 2560;

function mount(shown: Shown) {
  const latest: { current: WorkspaceColumns | null } = { current: null };
  function Host(props: Shown) {
    latest.current = useWorkspaceColumns(props);
    return null;
  }
  const rendered = render(createElement(Host, shown));
  const columns = (): WorkspaceColumns => {
    if (latest.current === null) {
      throw new Error("the host rendered no columns");
    }
    return latest.current;
  };
  return {
    columns,
    call: (run: (columns: WorkspaceColumns) => void) => act(() => run(columns())),
    show: (next: Shown) => rendered.update(createElement(Host, next)),
    unmount: rendered.unmount,
  };
}

beforeEach(() => {
  window.innerWidth = WIDE_PX;
});

describe("useWorkspaceColumns", () => {
  it("draws the rail, the centre and the column the page is showing", () => {
    const both = mount({ collapsed: false, changesShown: true });
    expect(both.columns().template).toBe("240px 1fr 360px");
    both.show({ collapsed: true, changesShown: true });
    expect(both.columns().template).toBe("52px 1fr 360px");
    both.show({ collapsed: true, changesShown: false });
    expect(both.columns().template).toBe("52px 1fr");
    both.show({ collapsed: false, changesShown: false });
    expect(both.columns().template).toBe("240px 1fr");
    both.unmount();
  });

  it("reopens the Changes column at its default width", () => {
    const host = mount({ collapsed: false, changesShown: true });
    host.call((columns) => columns.changes.set(500));
    expect(host.columns().changes.width).toBe(500);
    host.show({ collapsed: false, changesShown: false });
    host.show({ collapsed: false, changesShown: true });
    expect(host.columns().changes.width).toBe(360);
    expect(host.columns().template).toBe("240px 1fr 360px");
    host.unmount();
  });

  it("reopens the sidebar at its default width", () => {
    const host = mount({ collapsed: false, changesShown: false });
    host.call((columns) => columns.sidebar.set(320));
    expect(host.columns().sidebar.width).toBe(320);
    host.show({ collapsed: true, changesShown: false });
    host.show({ collapsed: false, changesShown: false });
    expect(host.columns().sidebar.width).toBe(240);
    host.unmount();
  });

  it("holds both panes at their ceiling when the column opens over a wide sidebar", () => {
    window.innerWidth = 1280;
    const host = mount({ collapsed: false, changesShown: false });
    host.call((columns) => columns.sidebar.set(400));
    expect(host.columns().template).toBe("400px 1fr");

    host.show({ collapsed: false, changesShown: true });
    const { sidebar, changes } = host.columns();

    expect(host.columns().template).toBe("280px 1fr 300px");
    expect(sidebar.width).toBeLessThanOrEqual(sidebar.max);
    expect(changes.width).toBeLessThanOrEqual(changes.max);
    // The centre keeps its 640 px: 1280 less the 580 px the two panes are held to.
    expect(1280 - sidebar.width - changes.width).toBeGreaterThanOrEqual(640);

    // The drag is remembered, not rewritten: closing the column gives the sidebar its 400 back.
    host.show({ collapsed: false, changesShown: false });
    expect(host.columns().sidebar.width).toBe(400);
    host.unmount();
  });

  it("drops the sidebar's ceiling when the column opens on a 1280 px window", () => {
    window.innerWidth = 1280;
    const host = mount({ collapsed: false, changesShown: false });
    expect(host.columns().sidebar.max).toBe(400);
    host.show({ collapsed: false, changesShown: true });
    expect(host.columns().sidebar.max).toBe(280);
    host.unmount();
  });
});
