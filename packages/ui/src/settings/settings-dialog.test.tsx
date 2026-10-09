// @vitest-environment happy-dom
import type { ConfigResponse, MachineConfig } from "@agnostic/core";
import { act } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../api/error";
import { TooltipProvider } from "../components/tooltip";
import { createAppearanceRoot } from "../styles/appearance-root";
import { click, find, render, typeInto } from "../test/render";
import { stubClient } from "../test/workspace-fixture";
import { doctorResponse } from "../usage/usage-response.fixture";
import { SettingsDialog } from "./settings-dialog";

const CONFIG: MachineConfig = {
  port: null,
  plans: {},
  editor: null,
  catalogCheck: true,
  specWriter: null,
  budget: { dailyUsd: null, weeklyUsd: null },
  hooks: { claudeStatusline: "user" },
  appearance: { theme: "rosewood", mode: "system" },
  terminal: { font: null, size: 13 },
  catalogStaleDays: 7,
  specFirst: false,
};

const ANSWER: ConfigResponse = { config: CONFIG, file: "/Users/you/.agnostic/config.yaml" };

const MEDIA = {
  matches: true,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
} as unknown as MediaQueryList;

/** Resolves after the dialog's read and every state update it causes. */
async function settled(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function open(patchConfig = vi.fn(() => Promise.resolve(ANSWER))) {
  const doctor = vi.fn(() => Promise.resolve(doctorResponse()));
  const client = stubClient({ config: () => Promise.resolve(ANSWER), patchConfig, doctor });
  const root = createAppearanceRoot(document.documentElement, MEDIA, localStorage);
  const announced: MachineConfig[] = [];
  const view = render(
    <TooltipProvider>
      <SettingsDialog
        open
        onOpenChange={vi.fn()}
        client={client}
        root={root}
        health={null}
        connection="live"
        profiles={[]}
        onConfig={(config) => void announced.push(config)}
      />
    </TooltipProvider>,
  );
  return { ...view, patchConfig, doctor, announced };
}

/** The dialog portals out of the render container, so every query runs against its own frame. */
function panel(): HTMLElement {
  const frames = document.querySelectorAll<HTMLElement>('[data-slot="dialog-content"]');
  const found = frames[frames.length - 1];
  if (found === undefined) {
    throw new Error("the dialog drew no frame");
  }
  return found;
}

function card(theme: string): HTMLElement {
  return find(panel(), `[data-theme-card="${theme}"]`);
}

function nav(label: string): HTMLElement {
  const found = [...panel().querySelectorAll("button")].find((row) => row.textContent === label);
  if (found === undefined) {
    throw new Error(`no nav row "${label}"`);
  }
  return found;
}

function type(label: string, value: string): void {
  typeInto(find<HTMLInputElement>(panel(), `input[aria-label="${label}"]`), value);
}

/** Radix opens its list from the keyboard; its pointer handlers need a layout happy-dom has not. */
function pick(label: string, option: string): void {
  const trigger = panel().querySelector<HTMLElement>(`[aria-label="${label}"]`);
  act(() => {
    trigger?.focus();
    trigger?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  const item = [...document.querySelectorAll<HTMLElement>("[data-slot='select-item']")].find(
    (row) => row.textContent === option,
  );
  act(() => {
    item?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    item?.click();
  });
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

it("opens on Appearance, with the file it will write under the controls", async () => {
  const { unmount } = open();
  await settled();
  expect(panel().querySelector("h3")?.textContent).toBe("Appearance");
  expect(panel().textContent).toContain("/Users/you/.agnostic/config.yaml");
  unmount();
});

it("switches sections from the nav, which is a labelled list per group", async () => {
  const { unmount } = open();
  await settled();
  const lists = panel().querySelectorAll('nav[aria-label="Settings sections"] ul[aria-labelledby]');
  expect(lists.length).toBeGreaterThan(0);
  click(nav("Shortcuts"));
  expect(nav("Shortcuts").getAttribute("aria-current")).toBe("page");
  expect(panel().querySelector("h3")?.textContent).toBe("Shortcuts");
  expect(panel().textContent).toContain("Shortcuts can't be changed yet.");
  unmount();
});

it("keeps the open section while the query matches it, and opens the first match otherwise", async () => {
  const { unmount } = open();
  await settled();
  type("Search settings", "theme");
  expect(panel().querySelector("h3")?.textContent).toBe("Appearance");
  expect(panel().textContent).not.toContain("Shortcuts");
  unmount();
});

it("paints a theme before the daemon has answered, and asks for it", async () => {
  const slow = vi.fn(() => new Promise<ConfigResponse>(() => undefined));
  const { unmount } = open(slow);
  await settled();
  click(card("slate"));
  expect(document.documentElement.getAttribute("data-theme")).toBe("slate");
  expect(slow).toHaveBeenCalledWith({ appearance: { theme: "slate" } });
  unmount();
});

it("asks for the mode the user picked", async () => {
  const { patchConfig, unmount } = open();
  await settled();
  const light = [...panel().querySelectorAll<HTMLInputElement>('input[type="radio"]')][1];
  act(() => light?.click());
  expect(patchConfig).toHaveBeenCalledWith({ appearance: { mode: "light" } });
  unmount();
});

it("leaves a refused change on screen and says what the daemon said", async () => {
  const refused = vi.fn(() =>
    Promise.reject(
      new ApiError("config.yaml is not writable", { code: "ag-file-invalid", status: 400 }),
    ),
  );
  const { unmount } = open(refused);
  await settled();
  click(card("ink"));
  await settled();
  expect(document.documentElement.getAttribute("data-theme")).toBe("ink");
  expect(panel().textContent).toContain("config.yaml is not writable");
  unmount();
});

it("asks for the terminal font the Daemon section picked", async () => {
  const { patchConfig, unmount } = open();
  await settled();
  click(nav("Daemon and terminal"));
  pick("Terminal font", "JetBrains Mono");
  expect(patchConfig).toHaveBeenCalledWith({ terminal: { font: "JetBrains Mono" } });
  unmount();
});

it("asks the daemon once when a section that needs detection opens, not before", async () => {
  const { doctor, unmount } = open();
  await settled();
  expect(doctor).not.toHaveBeenCalled();
  click(nav("Agents and profiles"));
  await settled();
  expect(doctor).toHaveBeenCalledTimes(1);
  click(nav("Plans and keys"));
  await settled();
  expect(doctor).toHaveBeenCalledTimes(1);
  unmount();
});

it("hands the page every config answer, so its own copy follows a change", async () => {
  const { announced, unmount } = open();
  await settled();
  expect(announced).toEqual([CONFIG]);
  click(card("slate"));
  await settled();
  expect(announced).toHaveLength(2);
  unmount();
});

it("shows what the daemon said under each section that asked it for a detection", async () => {
  const doctor = vi.fn(() =>
    Promise.reject(new ApiError("tmux is not installed", { code: "tmux-not-found", status: 500 })),
  );
  const client = stubClient({ config: () => Promise.resolve(ANSWER), doctor });
  const root = createAppearanceRoot(document.documentElement, MEDIA, localStorage);
  const { unmount } = render(
    <TooltipProvider>
      <SettingsDialog
        open
        onOpenChange={vi.fn()}
        client={client}
        root={root}
        health={null}
        connection="live"
        profiles={[]}
        onConfig={vi.fn()}
      />
    </TooltipProvider>,
  );
  for (const label of ["Agents and profiles", "Plans and keys", "Daemon and terminal"]) {
    click(nav(label));
    await settled();
    expect(panel().textContent).toContain("tmux is not installed");
  }
  unmount();
});
