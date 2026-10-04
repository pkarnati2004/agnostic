import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

// React refuses to run `act` without it; the component tests are the only DOM this page has.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export type Rendered = {
  container: HTMLElement;
  update(node: ReactNode): void;
  unmount(): void;
};

/** A root in a detached container: enough to read what a component draws, without a library. */
export function render(node: ReactNode): Rendered {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return {
    container,
    // `update` runs inside `act` itself; wrapping a call in another `act` corrupts React's act queue.
    update: (next) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

export function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** The one element matching, because a test that found none would fail on a null later. */
export function find<T extends Element>(container: HTMLElement, selector: string): T {
  const element = container.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`nothing rendered for "${selector}"`);
  }
  return element;
}
