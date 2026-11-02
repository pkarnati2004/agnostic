import type { DesktopBridge } from "@agnostic/core";
import { DESKTOP_BRIDGE_KEY } from "@agnostic/core/browser";

declare global {
  interface Window {
    /** Set by the Mac app's preload; checked, never trusted, by `desktopBridge`. */
    agnostic?: unknown;
  }
}

/**
 * The Mac app's preload puts a folder picker on `window.agnostic`; a browser has none. The page
 * asks for the bridge itself rather than for the user agent, because its absence is the fact the
 * Browse buttons need.
 */
export function desktopBridge(host: { agnostic?: unknown } = window): DesktopBridge | null {
  const candidate = host[DESKTOP_BRIDGE_KEY];
  if (typeof candidate !== "object" || candidate === null || !("pickFolder" in candidate)) {
    return null;
  }
  return typeof candidate.pickFolder === "function" ? (candidate as DesktopBridge) : null;
}
