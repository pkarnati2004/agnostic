// @vitest-environment happy-dom
import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { find, render } from "../test/render";
import { PaneHandle } from "./pane-handle";
import { useWorkspaceColumns } from "./workspace-columns";

/** Wide enough that both panes reach their own maximum, so a test can drag to it. */
const WIDE_PX = 2560;

// happy-dom has no pointer capture and no PointerEvent; the component calls the two methods
// unconditionally, so the tests give them to every element and dispatch mouse events by the
// pointer names, which is what React reads the handlers from.
type Capturing = { setPointerCapture(id: number): void; releasePointerCapture(id: number): void };

/** The page the handle lives on: one grid whose template the drag is meant to move. */
function Host({ edge }: { edge: "left" | "right" }) {
  const columns = useWorkspaceColumns({ collapsed: false, changesShown: edge === "left" });
  const column = edge === "right" ? columns.sidebar : columns.changes;
  return (
    <div id="grid" style={{ gridTemplateColumns: columns.template }}>
      <PaneHandle
        edge={edge}
        label={edge === "right" ? "Resize sidebar" : "Resize Changes"}
        column={column}
      />
    </div>
  );
}

const frames: (() => void)[] = [];

function mount(edge: "left" | "right") {
  const view = render(<Host edge={edge} />);
  return {
    handle: find<HTMLElement>(view.container, '[role="separator"]'),
    grid: find<HTMLElement>(view.container, "#grid"),
    unmount: view.unmount,
  };
}

function pointer(element: Element, type: string, clientX: number): void {
  act(() => {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX }));
  });
}

/** One frame of a drag: the component asks for at most one between two moves. */
function frame(): void {
  const next = frames.shift();
  if (next === undefined) {
    throw new Error("the drag asked for no frame");
  }
  act(next);
}

function press(element: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key });
  act(() => {
    element.dispatchEvent(event);
  });
  return event;
}

function width(handle: HTMLElement): number {
  return Number(handle.getAttribute("aria-valuenow"));
}

beforeEach(() => {
  window.innerWidth = WIDE_PX;
  frames.length = 0;
  const prototype = Element.prototype as unknown as Capturing;
  prototype.setPointerCapture = () => undefined;
  prototype.releasePointerCapture = () => undefined;
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(() => callback(0));
    return frames.length;
  };
  globalThis.cancelAnimationFrame = () => undefined;
});

describe("PaneHandle", () => {
  it("is a vertical separator carrying its pane's width and range", () => {
    const view = mount("right");
    expect(view.handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(view.handle.getAttribute("aria-label")).toBe("Resize sidebar");
    expect(width(view.handle)).toBe(240);
    expect(view.handle.getAttribute("aria-valuemin")).toBe("200");
    expect(view.handle.getAttribute("aria-valuemax")).toBe("400");
    view.unmount();
  });

  it("widens a right-edge pane by the pointer's travel, once a frame", () => {
    const view = mount("right");
    pointer(view.handle, "pointerdown", 100);
    pointer(view.handle, "pointermove", 150);
    frame();
    expect(width(view.handle)).toBe(290);
    expect(view.grid.style.gridTemplateColumns).toBe("290px 1fr");
    pointer(view.handle, "pointerup", 150);
    view.unmount();
  });

  it("narrows a left-edge pane by the same drag", () => {
    const view = mount("left");
    pointer(view.handle, "pointerdown", 100);
    pointer(view.handle, "pointermove", 150);
    frame();
    expect(width(view.handle)).toBe(310);
    expect(view.grid.style.gridTemplateColumns).toBe("240px 1fr 310px");
    pointer(view.handle, "pointerup", 150);
    view.unmount();
  });

  it("stops at the maximum however far the pointer goes", () => {
    const view = mount("right");
    pointer(view.handle, "pointerdown", 100);
    pointer(view.handle, "pointermove", 1000);
    frame();
    pointer(view.handle, "pointerup", 1000);
    expect(width(view.handle)).toBe(400);
    view.unmount();
  });

  it("marks the body while the drag is held and not after it", () => {
    const view = mount("right");
    expect(document.body.classList.contains("pane-dragging")).toBe(false);
    pointer(view.handle, "pointerdown", 100);
    expect(document.body.classList.contains("pane-dragging")).toBe(true);
    expect(view.handle.hasAttribute("data-dragging")).toBe(true);
    pointer(view.handle, "pointerup", 120);
    expect(document.body.classList.contains("pane-dragging")).toBe(false);
    expect(view.handle.hasAttribute("data-dragging")).toBe(false);
    view.unmount();
  });

  it("applies the last position on pointerup even with a frame pending", () => {
    const view = mount("right");
    pointer(view.handle, "pointerdown", 100);
    pointer(view.handle, "pointermove", 150);
    pointer(view.handle, "pointerup", 170);
    expect(width(view.handle)).toBe(310);
    view.unmount();
  });

  it("moves the edge 16 px per arrow and to the ends on Home and End", () => {
    const view = mount("right");
    expect(press(view.handle, "ArrowRight").defaultPrevented).toBe(true);
    expect(width(view.handle)).toBe(256);
    press(view.handle, "ArrowLeft");
    press(view.handle, "ArrowLeft");
    expect(width(view.handle)).toBe(224);
    expect(press(view.handle, "Home").defaultPrevented).toBe(true);
    expect(width(view.handle)).toBe(200);
    expect(press(view.handle, "End").defaultPrevented).toBe(true);
    expect(width(view.handle)).toBe(400);
    view.unmount();
  });

  it("leaves a key it does not handle alone", () => {
    const view = mount("right");
    expect(press(view.handle, "Enter").defaultPrevented).toBe(false);
    expect(width(view.handle)).toBe(240);
    view.unmount();
  });

  it("restores the default width on a double-click", () => {
    const view = mount("right");
    press(view.handle, "End");
    act(() => {
      view.handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(width(view.handle)).toBe(240);
    view.unmount();
  });
});
