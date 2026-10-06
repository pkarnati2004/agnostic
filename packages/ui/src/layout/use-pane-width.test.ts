// @vitest-environment happy-dom
import { act, createElement } from "react";
import { describe, expect, it } from "vitest";
import { render } from "../test/render";
import { SIDEBAR_RANGE } from "./pane-width";
import { type PaneWidth, usePaneWidth } from "./use-pane-width";

function mount(shown: boolean) {
  const latest: { current: PaneWidth | null } = { current: null };
  function Host(props: { shown: boolean }) {
    latest.current = usePaneWidth(SIDEBAR_RANGE, props.shown);
    return null;
  }
  const rendered = render(createElement(Host, { shown }));
  const pane = (): PaneWidth => {
    if (latest.current === null) {
      throw new Error("the host rendered no width");
    }
    return latest.current;
  };
  return {
    pane,
    call: (run: (pane: PaneWidth) => void) => act(() => run(pane())),
    show: (next: boolean) => rendered.update(createElement(Host, { shown: next })),
    unmount: rendered.unmount,
  };
}

describe("usePaneWidth", () => {
  it("starts at the default", () => {
    const host = mount(true);
    expect(host.pane().width).toBe(240);
    host.unmount();
  });

  it("clamps what it is set to", () => {
    const host = mount(true);
    host.call((pane) => pane.set(1000));
    expect(host.pane().width).toBe(400);
    host.call((pane) => pane.set(0));
    expect(host.pane().width).toBe(200);
    host.call((pane) => pane.set(263));
    expect(host.pane().width).toBe(263);
    host.unmount();
  });

  it("goes back to the default on reset", () => {
    const host = mount(true);
    host.call((pane) => pane.set(320));
    host.call((pane) => pane.reset());
    expect(host.pane().width).toBe(240);
    host.unmount();
  });

  it("forgets the width of a pane that stopped being drawn", () => {
    const host = mount(true);
    host.call((pane) => pane.set(320));
    host.show(false);
    host.show(true);
    expect(host.pane().width).toBe(240);
    host.unmount();
  });
});
