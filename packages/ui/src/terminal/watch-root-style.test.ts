// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { watchRootStyle } from "./watch-root-style";

/** The observer delivers on a microtask, so every assertion waits one turn. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

it("fires on the attributes a theme, a mode and a font pick write", async () => {
  const root = document.createElement("html");
  const onChange = vi.fn();
  const stop = watchRootStyle(root, onChange);

  root.setAttribute("data-theme", "slate");
  await settled();
  expect(onChange).toHaveBeenCalled();

  onChange.mockClear();
  root.classList.add("light");
  await settled();
  expect(onChange).toHaveBeenCalled();

  onChange.mockClear();
  root.style.setProperty("--terminal-font-size", "15px");
  await settled();
  expect(onChange).toHaveBeenCalled();

  stop();
});

it("ignores an attribute no part of the page's style lives in", async () => {
  const root = document.createElement("html");
  const onChange = vi.fn();
  const stop = watchRootStyle(root, onChange);

  root.setAttribute("lang", "en");
  await settled();
  expect(onChange).not.toHaveBeenCalled();

  stop();
});

it("stops once the returned function is called", async () => {
  const root = document.createElement("html");
  const onChange = vi.fn();
  watchRootStyle(root, onChange)();

  root.setAttribute("data-theme", "ink");
  await settled();
  expect(onChange).not.toHaveBeenCalled();
});
