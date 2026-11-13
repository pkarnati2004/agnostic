import { userInfo } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  CoreError,
  createDaemonClient,
  errorMessage,
  readAuthToken,
  run,
  scrubEnv,
} from "@agnostic/core";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { daemonEnv, ensureDaemon, stopDaemon } from "./daemon-launch.js";
import { PICK_FOLDER_CHANNEL, RECHECK_CHANNEL } from "./ipc-channels.js";
import { menuTemplate } from "./menu.js";
import { pickFolderHandler } from "./pick-folder.js";
import { loginShellEnv } from "./shell-env.js";
import { shellLog } from "./shell-log.js";
import { homeFor, nextPage } from "./start-sequence.js";
import { createWorkspaceWindow, type WorkspaceWindow } from "./workspace-window.js";

const DOCS_URL = "https://github.com/pkarnati2004/agnostic#readme";

const appRoot = app.getAppPath();
const statusPage = pathToFileURL(join(appRoot, "status.html")).href;

let captured: ReturnType<typeof loginShellEnv> | null = null;
let current: WorkspaceWindow | null = null;
let starting: Promise<void> | null = null;

/** Read once per app start: the rc files run once, and every later step sees the same env. */
function shellEnv(): ReturnType<typeof loginShellEnv> {
  captured ??= loginShellEnv({
    shell: process.env.SHELL ?? userInfo().shell ?? "/bin/zsh",
    base: scrubEnv(process.env),
    run,
  });
  return captured;
}

/** `<home>/logs/desktop.log`, whose home is only known once the login shell has answered. */
function log(line: string): void {
  shellEnv()
    .then(({ env }) => shellLog(join(homeFor(env), "logs", "desktop.log"), null)(line))
    .catch((cause: unknown) => {
      // The log is the only place the app writes to; a line it cannot write has nowhere else to go.
      process.emitWarning(`desktop.log: ${errorMessage(cause)}`);
    });
}

function windowNow(): WorkspaceWindow {
  if (current === null) {
    const opened = createWorkspaceWindow({ appRoot, log });
    opened.window.on("closed", () => {
      current = null;
    });
    current = opened;
  }
  return current;
}

/** One start at a time: a second "Try again" while the first is still waiting joins it. */
function start(): Promise<void> {
  starting ??= runStart().finally(() => {
    starting = null;
  });
  return starting;
}

async function runStart(): Promise<void> {
  try {
    await windowNow().show({ kind: "status", state: { kind: "starting" } });
    const page = await nextPage({
      env: shellEnv,
      appRoot,
      ensureDaemon,
      readToken: readAuthToken,
      tmux: async (baseUrl, token) =>
        (await createDaemonClient({ baseUrl, token }).doctor({})).tmux,
      log,
    });
    // Asked again, not reused: a window closed while agnd was starting is opened anew here.
    await windowNow().show(page);
  } catch (cause) {
    // A load the window aborted is logged by its own did-fail-load handler, redacted.
    log(`start: the page did not open: ${cause instanceof Error ? cause.name : "unknown"}`);
  }
}

function quitAndStopDaemon(): void {
  shellEnv()
    .then(({ env }) => stopDaemon({ appRoot, env: daemonEnv(env, homeFor(env)), run }))
    .catch((cause: unknown) => log(`quit: agnd stop failed: ${errorMessage(cause)}`))
    .finally(() => app.quit());
}

function listen(): void {
  ipcMain.handle(PICK_FOLDER_CHANNEL, (event, raw: unknown) => {
    // Only the app's own window may ask, and asking never opens one.
    const win = current;
    if (win === null || event.sender !== win.window.webContents) {
      throw new CoreError("the folder picker answers only the agnostic window", {
        code: "desktop-sender-refused",
      });
    }
    const pick = pickFolderHandler({
      daemonOrigin: win.daemonOrigin(),
      showOpenDialog: (options) => dialog.showOpenDialog(win.window, options),
    });
    return pick(event.senderFrame?.url, raw);
  });
  ipcMain.on(RECHECK_CHANNEL, (event) => {
    if (event.senderFrame?.url.startsWith(statusPage) === true) {
      void start();
    }
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (current === null) {
      void start();
      return;
    }
    if (current.window.isMinimized()) {
      current.window.restore();
    }
    current.window.focus();
  });
  // macOS keeps an app with no window in the Dock; the daemon keeps running either way.
  app.on("window-all-closed", () => undefined);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void start();
    }
  });
  void app.whenReady().then(() => {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        menuTemplate({ quitAndStopDaemon, openDocs: () => void shell.openExternal(DOCS_URL) }),
      ),
    );
    listen();
    return start();
  });
}
