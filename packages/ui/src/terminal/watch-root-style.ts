/** The attributes the page's theme, its colour scheme and its terminal font live in. */
const WATCHED = ["class", "data-theme", "style"];

/**
 * Calls back whenever the root element's theme, scheme or custom properties change. An open
 * terminal is a canvas React does not redraw, so it learns a theme pick this way rather than
 * through a prop: the one writer is `appearance-root.ts`, and every pane watches what it writes.
 */
export function watchRootStyle(root: HTMLElement, onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(root, { attributes: true, attributeFilter: WATCHED });
  return () => observer.disconnect();
}
