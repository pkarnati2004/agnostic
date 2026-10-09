// @vitest-environment happy-dom
import type { Appearance, ConfigResponse, MachineConfig, TerminalConfig } from "@agnostic/core";
import { act, createElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../api/error";
import type { AppearanceRoot } from "../styles/appearance-root";
import { render } from "../test/render";
import { stubClient } from "../test/workspace-fixture";
import { type ConfigState, useConfig } from "./use-config";

const CONFIG: MachineConfig = {
  port: null,
  plans: {},
  editor: null,
  catalogCheck: true,
  specWriter: null,
  budget: { dailyUsd: null, weeklyUsd: null },
  hooks: { claudeStatusline: "user" },
  appearance: { theme: "ink", mode: "dark" },
  terminal: { font: "Menlo", size: 15 },
  catalogStaleDays: 7,
  specFirst: false,
};

const ANSWER: ConfigResponse = { config: CONFIG, file: "/tmp/config.yaml" };

/** Records what the page was painted as, in order, without touching a real document. */
function recordingRoot() {
  const applied: Appearance[] = [];
  const terminals: TerminalConfig[] = [];
  const root: AppearanceRoot = {
    apply: (appearance) => void applied.push(appearance),
    applyTerminal: (terminal) => void terminals.push(terminal),
    dispose: () => undefined,
  };
  return { root, applied, terminals };
}

/** Mounts the hook in a host that draws nothing, with the dialog already open. */
async function openConfig(patchConfig: () => Promise<ConfigResponse>) {
  const { root, applied, terminals } = recordingRoot();
  const client = stubClient({ config: () => Promise.resolve(ANSWER), patchConfig });
  const latest: { current: ConfigState | null } = { current: null };
  const announced: MachineConfig[] = [];
  function Host() {
    latest.current = useConfig(client, root, true, (config) => void announced.push(config));
    return null;
  }
  const rendered = render(createElement(Host));
  await act(async () => {
    await Promise.resolve();
  });
  const state = () => latest.current as ConfigState;
  return { state, unmount: rendered.unmount, applied, terminals, announced };
}

beforeEach(() => {
  localStorage.clear();
});

it("reads config.yaml when the dialog opens", async () => {
  const { state, unmount } = await openConfig(() => Promise.resolve(ANSWER));
  expect(state().config).toEqual(CONFIG);
  expect(state().file).toBe("/tmp/config.yaml");
  unmount();
});

it("paints the half the body names over the half on file, before the daemon answers", async () => {
  const pending = vi.fn(() => new Promise<ConfigResponse>(() => undefined));
  const { state, unmount, applied, terminals } = await openConfig(pending);
  await act(async () => {
    void state().patch({ appearance: { theme: "moss" } });
  });
  expect(applied.at(-1)).toEqual({ theme: "moss", mode: "dark" });

  await act(async () => {
    void state().patch({ terminal: { size: 12 } });
  });
  expect(terminals.at(-1)).toEqual({ font: "Menlo", size: 12 });
  unmount();
});

it("takes a null font as the page's own mono rather than as no answer", async () => {
  const pending = vi.fn(() => new Promise<ConfigResponse>(() => undefined));
  const { state, unmount, terminals } = await openConfig(pending);
  await act(async () => {
    void state().patch({ terminal: { font: null } });
  });
  expect(terminals.at(-1)).toEqual({ font: null, size: 15 });
  unmount();
});

it("repaints with the daemon's answer, which wins over what was painted on the click", async () => {
  const settled: ConfigResponse = {
    config: { ...CONFIG, appearance: { theme: "carbon", mode: "dark" } },
    file: "/tmp/config.yaml",
  };
  const { state, unmount, applied } = await openConfig(() => Promise.resolve(settled));
  await act(async () => {
    await state().patch({ appearance: { theme: "moss" } });
  });
  // The click paints moss first, but the daemon's own answer (carbon) is what the page keeps.
  expect(applied).toEqual([
    { theme: "moss", mode: "dark" },
    { theme: "carbon", mode: "dark" },
  ]);
  expect(state().config?.appearance).toEqual({ theme: "carbon", mode: "dark" });
  unmount();
});

it("keeps what it painted when the daemon refuses, and says what it said", async () => {
  const refused = () =>
    Promise.reject(
      new ApiError("config.yaml is read-only", { code: "ag-file-invalid", status: 400 }),
    );
  const { state, unmount, applied } = await openConfig(refused);
  await act(async () => {
    await state().patch({ appearance: { theme: "carbon" } });
  });
  expect(applied.at(-1)).toEqual({ theme: "carbon", mode: "dark" });
  expect(state().error).toBe("config.yaml is read-only");
  unmount();
});

it("announces every answer, so the page's own copy follows the open read and each patch", async () => {
  const settled: ConfigResponse = {
    config: { ...CONFIG, specFirst: true },
    file: "/tmp/config.yaml",
  };
  const { state, unmount, announced } = await openConfig(() => Promise.resolve(settled));
  expect(announced).toEqual([CONFIG]);
  await act(async () => {
    await state().patch({ specFirst: true });
  });
  expect(announced.at(-1)?.specFirst).toBe(true);
  unmount();
});
