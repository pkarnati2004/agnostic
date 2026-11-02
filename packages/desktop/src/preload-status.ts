import { contextBridge, ipcRenderer } from "electron";
import { RECHECK_CHANNEL } from "./ipc-channels.js";

// The page's own location; the package compiles without the DOM library, for main's sake.
declare const location: { protocol: string };

// Registered for the status page's URL only; the protocol check keeps it off any page from the web.
if (location.protocol === "file:") {
  contextBridge.exposeInMainWorld("agnosticStatus", {
    recheck: () => ipcRenderer.send(RECHECK_CHANNEL),
  });
}
