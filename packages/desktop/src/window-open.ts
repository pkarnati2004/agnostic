/** What a `window.open` or a `target="_blank"` link from the workspace turns into. */
export type OpenTarget =
  | { kind: "hidden-child" }
  | { kind: "external"; url: string }
  | { kind: "deny" };

/**
 * Create PR opens an empty tab on the click and sets its location once the PR exists, so
 * `about:blank` becomes a hidden window whose first web navigation goes to the default browser.
 * A web URL goes to the default browser at once; nothing else opens.
 */
export function openTarget(url: string): OpenTarget {
  if (url === "about:blank" || url === "") {
    return { kind: "hidden-child" };
  }
  try {
    const protocol = new URL(url).protocol;
    if (protocol === "http:" || protocol === "https:") {
      return { kind: "external", url };
    }
  } catch {
    // Not a URL: nothing to open.
  }
  return { kind: "deny" };
}
