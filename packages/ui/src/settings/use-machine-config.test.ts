// @vitest-environment happy-dom
import type { Appearance, ConfigResponse, MachineConfig, TerminalConfig } from "@agnostic/core";
import { act, createElement } from "react";
import { expect, it, vi } from "vitest";
import type { AppearanceRoot } from "../styles/appearance-root";
import { render } from "../test/render";
import { stubClient } from "../test/workspace-fixture";
import { useMachineConfig } from "./use-machine-config";

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
  catalogStaleDays: 3,
  specFirst: true,
};

const ANSWER: ConfigResponse = { config: CONFIG, file: "/tmp/config.yaml" };

type Held = ReturnType<typeof useMachineConfig>;

async function host(config: () => Promise<ConfigResponse>) {
  const applied: Appearance[] = [];
  const terminals: TerminalConfig[] = [];
  const root: AppearanceRoot = {
    apply: (appearance) => void applied.push(appearance),
    applyTerminal: (terminal) => void terminals.push(terminal),
    dispose: () => undefined,
  };
  const client = stubClient({ config });
  const latest: { current: Held | null } = { current: null };
  function Host() {
    latest.current = useMachineConfig(client, root);
    return null;
  }
  const rendered = render(createElement(Host));
  await act(async () => {
    await Promise.resolve();
  });
  return {
    held: () => latest.current as Held,
    applied,
    terminals,
    unmount: rendered.unmount,
  };
}

it("applies what config.yaml says and keeps it for the page", async () => {
  const { held, applied, terminals, unmount } = await host(() => Promise.resolve(ANSWER));
  expect(applied).toEqual([{ theme: "ink", mode: "dark" }]);
  expect(terminals).toEqual([{ font: "Menlo", size: 15 }]);
  expect(held().config).toEqual(CONFIG);
  unmount();
});

it("takes a replacement, which is how a Settings answer reaches the page", async () => {
  const { held, unmount } = await host(() => Promise.resolve(ANSWER));
  act(() => held().setConfig({ ...CONFIG, specFirst: false }));
  expect(held().config?.specFirst).toBe(false);
  unmount();
});

it("leaves the mirror's theme up and the config null when the read fails", async () => {
  const { held, applied, unmount } = await host(() => Promise.reject(new Error("no daemon")));
  expect(applied).toEqual([]);
  expect(held().config).toBeNull();
  unmount();
});

it("reads once, not per render", async () => {
  const config = vi.fn(() => Promise.resolve(ANSWER));
  const { held, unmount } = await host(config);
  act(() => held().setConfig(CONFIG));
  expect(config).toHaveBeenCalledTimes(1);
  unmount();
});
