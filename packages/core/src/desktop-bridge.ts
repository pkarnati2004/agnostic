/** What the desktop app's preload puts on `window.agnostic`; absent in a browser. */
export type DesktopBridge = {
  /** A native folder dialog; null when the user cancelled. */
  pickFolder(request?: { defaultPath?: string }): Promise<string | null>;
};

export const DESKTOP_BRIDGE_KEY = "agnostic";
