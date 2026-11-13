import type { MenuItemConstructorOptions } from "electron";

export type MenuActions = { quitAndStopDaemon: () => void; openDocs: () => void };

/**
 * The standard macOS menus. The Edit roles are what carry ⌘C and ⌘V into the page, xterm
 * included. No accelerator here takes one of the workspace's own: ⌘⇧H, ⌘\, ⌘⇧C, ⌃⇥ and ⌘K.
 */
export function menuTemplate(actions: MenuActions): MenuItemConstructorOptions[] {
  return [
    appMenu(actions),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      role: "window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "close" },
        { role: "front" },
      ],
    },
    {
      role: "help",
      submenu: [{ label: "Documentation", click: actions.openDocs }],
    },
  ];
}

/** The menu under the app's name: Quit leaves agnd running, Quit and Stop Daemon ends it too. */
function appMenu(actions: MenuActions): MenuItemConstructorOptions {
  return {
    label: "agnostic",
    submenu: [
      { role: "about" },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      {
        label: "Quit and Stop Daemon",
        accelerator: "Alt+CmdOrCtrl+Q",
        click: actions.quitAndStopDaemon,
      },
      { role: "quit" },
    ],
  };
}
