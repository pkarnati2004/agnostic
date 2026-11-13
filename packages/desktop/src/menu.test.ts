import { describe, expect, it, vi } from "vitest";
import { menuTemplate } from "./menu.js";

// Electron's own item type, without loading Electron in a test.
type MenuItemConstructorOptions = ReturnType<typeof menuTemplate>[number];

function items(template: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return template.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? items(item.submenu as MenuItemConstructorOptions[]) : []),
  ]);
}

const WORKSPACE_KEYS = [
  "CmdOrCtrl+Shift+H",
  "CmdOrCtrl+\\",
  "CmdOrCtrl+Shift+C",
  "Ctrl+Tab",
  "CmdOrCtrl+K",
];

describe("menuTemplate", () => {
  const actions = { quitAndStopDaemon: vi.fn(), openDocs: vi.fn() };
  const all = items(menuTemplate(actions));

  function labelled(label: string): MenuItemConstructorOptions {
    const item = all.find((entry) => entry.label === label);
    if (item === undefined) {
      throw new Error(`no menu item "${label}"`);
    }
    return item;
  }

  // The template's own items take no arguments; Electron's type names three it would pass.
  function press(label: string): void {
    const click = labelled(label).click as (() => void) | undefined;
    if (click === undefined) {
      throw new Error(`"${label}" has no click`);
    }
    click();
  }

  it("has the edit roles that carry copy and paste into the page", () => {
    const roles = all.map((item) => item.role);
    for (const role of ["copy", "paste", "cut", "selectAll", "undo", "redo", "quit", "hide"]) {
      expect(roles).toContain(role);
    }
  });

  it("takes none of the workspace's own shortcuts", () => {
    const taken = all.map((item) => item.accelerator).filter((key) => key !== undefined);
    for (const key of WORKSPACE_KEYS) {
      expect(taken).not.toContain(key);
    }
  });

  it("offers Quit and Stop Daemon on Alt+Cmd+Q, which calls the action", () => {
    expect(labelled("Quit and Stop Daemon").accelerator).toBe("Alt+CmdOrCtrl+Q");
    press("Quit and Stop Daemon");
    expect(actions.quitAndStopDaemon).toHaveBeenCalledOnce();
  });

  it("gives Quit and Stop Daemon the only custom accelerator, and keeps the plain Quit role", () => {
    const accelerators = all.filter((item) => item.accelerator !== undefined);
    expect(accelerators.map((item) => item.label)).toEqual(["Quit and Stop Daemon"]);
    expect(all.some((item) => item.role === "quit" && item.accelerator === undefined)).toBe(true);
  });

  it("opens the documentation from Help", () => {
    press("Documentation");
    expect(actions.openDocs).toHaveBeenCalledOnce();
  });
});
