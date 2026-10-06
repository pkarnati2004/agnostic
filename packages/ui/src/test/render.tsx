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

/**
 * Opens a Select by its label and answers its options. Radix opens its list from the keyboard; its
 * pointer handlers want a layout happy-dom does not provide. The list portals to the body, so the
 * options are read off the document rather than the container.
 */
export function openSelect(label: string): HTMLElement[] {
  const trigger = document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  act(() => {
    trigger?.focus();
    trigger?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  return [...document.querySelectorAll<HTMLElement>("[data-slot='select-item']")];
}

export function optionLabels(options: HTMLElement[]): string[] {
  return options.map((option) => option.textContent ?? "");
}

export function chooseOption(options: HTMLElement[], label: string): void {
  const option = options.find((row) => row.textContent === label);
  if (option === undefined) {
    throw new Error(`no option "${label}" in [${optionLabels(options).join(", ")}]`);
  }
  act(() => {
    option.focus();
    option.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}
