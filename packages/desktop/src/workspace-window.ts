import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { BrowserWindow, type Session, shell, type WebContents } from "electron";
import { limitPermissions, requestAllowed } from "./request-filter.js";
import { redact } from "./shell-log.js";
import type { ShellPage } from "./start-sequence.js";
import { statusUrl } from "./status-page.js";
import { openTarget } from "./window-open.js";

const STATUS_PRELOAD = "agnostic-status";

export type WorkspaceWindow = {
  window: BrowserWindow;
  /** The daemon origin the window may talk to; empty while the status page is in front. */
  daemonOrigin: () => string;
  show: (page: ShellPage) => Promise<void>;
};

/**
 * One window on the daemon's own page. The page gets no Node, an isolated preload and a sandbox;
 * its session reaches the daemon's origin, the status page and DevTools, and nothing else. Links
 * out go to the default browser, never into a second app window.
 */
export function createWorkspaceWindow(opts: {
  appRoot: string;
  log: (line: string) => void;
}): WorkspaceWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "agnostic",
    show: false,
    webPreferences: {
      preload: join(opts.appRoot, "preload-workspace.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
    },
  });
  let origin = "";
  let secret = "";
  const contents = window.webContents;
  guardSession(contents.session, opts.appRoot, () => origin);
  guardNavigation(contents, () => origin);
  // The page sets its own <title>; the window keeps the app's name.
  window.on("page-title-updated", (event) => event.preventDefault());
  window.once("ready-to-show", () => window.show());
  contents.on("did-fail-load", (_event, code, description, url, mainFrame) => {
    if (mainFrame) {
      opts.log(`window: ${redact(url, secret)} did not load: ${code} ${description}`);
    }
  });
  const show = async (page: ShellPage): Promise<void> => {
    if (page.kind === "status") {
      origin = "";
      await window.loadURL(statusUrl(join(opts.appRoot, "status.html"), page.state));
      return;
    }
    const url = new URL(page.url);
    origin = url.origin;
    secret = new URLSearchParams(url.hash.slice(1)).get("token") ?? "";
    await window.loadURL(page.url);
  };
  return { window, daemonOrigin: () => origin, show };
}

function guardSession(session: Session, appRoot: string, origin: () => string): void {
  session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !requestAllowed(details.url, origin(), appRoot) });
  });
  limitPermissions(session);
  // The session outlives a closed window, and a second registration under one id is refused.
  if (session.getPreloadScripts().some((script) => script.id === STATUS_PRELOAD)) {
    return;
  }
  session.registerPreloadScript({
    type: "frame",
    id: STATUS_PRELOAD,
    filePath: join(appRoot, "preload-status.cjs"),
    includeGlobs: [`${pathToFileURL(join(appRoot, "status.html")).href}*`],
  });
}

function guardNavigation(contents: WebContents, origin: () => string): void {
  contents.on("will-navigate", (event, url) => {
    if (!sameOrigin(url, origin())) {
      event.preventDefault();
    }
  });
  contents.setWindowOpenHandler(({ url }) => {
    const target = openTarget(url);
    if (target.kind === "external") {
      void shell.openExternal(target.url);
      return { action: "deny" };
    }
    if (target.kind === "hidden-child") {
      return { action: "allow", overrideBrowserWindowOptions: { show: false } };
    }
    return { action: "deny" };
  });
  contents.on("did-create-window", (child) => {
    child.webContents.on("will-navigate", (event, url) => forwardOnce(child, event, url));
    child.webContents.on("will-redirect", (event, url) => forwardOnce(child, event, url));
  });
}

/** The Create PR tab's first web address goes to the default browser; the hidden window closes. */
function forwardOnce(child: BrowserWindow, event: { preventDefault(): void }, url: string): void {
  const target = openTarget(url);
  if (target.kind === "hidden-child") {
    return;
  }
  event.preventDefault();
  if (target.kind === "external") {
    void shell.openExternal(target.url);
  }
  child.close();
}

function sameOrigin(url: string, origin: string): boolean {
  try {
    return origin !== "" && new URL(url).origin === origin;
  } catch {
    // Not a URL, so not the daemon's page.
    return false;
  }
}
