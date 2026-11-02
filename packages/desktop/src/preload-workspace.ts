import { DESKTOP_BRIDGE_KEY, type DesktopBridge } from "@agnostic/core/browser";
import { contextBridge, ipcRenderer } from "electron";
import { PICK_FOLDER_CHANNEL } from "./ipc-channels.js";

// The page's own location; the package compiles without the DOM library, for main's sake.
declare const location: { protocol: string };

// The window also shows the app's status page from disk; only the daemon's page gets the picker.
if (location.protocol === "http:") {
  const bridge: DesktopBridge = {
    pickFolder: (request) => ipcRenderer.invoke(PICK_FOLDER_CHANNEL, request),
  };
  contextBridge.exposeInMainWorld(DESKTOP_BRIDGE_KEY, bridge);
}
