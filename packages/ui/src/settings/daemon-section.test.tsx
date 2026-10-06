// @vitest-environment happy-dom
import type { HealthResponse } from "@agnostic/core";
import { expect, it, vi } from "vitest";
import { chooseOption, openSelect, optionLabels, render } from "../test/render";
import { doctorResponse } from "../usage/usage-response.fixture";
import { DaemonSection } from "./daemon-section";
import { TERMINAL_FONTS } from "./terminal-options";

const HEALTH: HealthResponse = {
  pid: 48102,
  port: 7431,
  startedAt: "2026-10-06T09:00:00.000Z",
  version: "1.1.0",
};

const TERMINAL = { font: null, size: 13 };

function section(props: Partial<Parameters<typeof DaemonSection>[0]> = {}) {
  return render(
    <DaemonSection
      health={HEALTH}
      connection="live"
      terminal={TERMINAL}
      onFont={vi.fn()}
      onSize={vi.fn()}
      report={null}
      file="/home/me/.agnostic/config.yaml"
      claudeStatusline="user"
      onClaudeStatusline={vi.fn()}
      {...props}
    />,
  );
}

it("says the daemon is running, with the version and the pid behind it", () => {
  const { container, unmount } = section();
  expect(container.textContent).toContain("Running");
  expect(container.textContent).toContain("v1.1.0 · pid 48102");
  unmount();
});

it("says the daemon is not running, and names no version it cannot have read", () => {
  const { container, unmount } = section({ health: null, connection: "reconnecting" });
  expect(container.textContent).toContain("Not running");
  expect(container.textContent).not.toContain("pid");
  unmount();
});

it("says a tmux at the floor is OK, one under it is too old, and a missing one is not found", () => {
  const ok = section({ report: doctorResponse({ tmux: { version: "3.4", ok: true } }) });
  expect(ok.container.textContent).toContain("3.4");
  expect(ok.container.textContent).toContain("OK");
  ok.unmount();
  const old = section({ report: doctorResponse({ tmux: { version: "3.2a", ok: false } }) });
  expect(old.container.textContent).toContain("3.2a");
  expect(old.container.textContent).toContain("Too old");
  old.unmount();
  const none = section({ report: doctorResponse({ tmux: { version: null, ok: false } }) });
  expect(none.container.textContent).toContain("Not found");
  none.unmount();
});

it("says it is checking the tmux version while the first detection is out", () => {
  const { container, unmount } = section({ report: null });
  expect(container.textContent).toContain("Checking…");
  unmount();
});

it("warns about a tmux server older than agn's settings, and only then", () => {
  const line = "The running tmux server predates agn's current settings.";
  const fresh = section({ report: doctorResponse({ tmuxConfigStale: false }) });
  expect(fresh.container.textContent).not.toContain(line);
  fresh.unmount();
  const stale = section({ report: doctorResponse({ tmuxConfigStale: true }) });
  expect(stale.container.textContent).toContain(line);
  expect(stale.container.textContent).toContain("tmux -L agn kill-server");
  stale.unmount();
});

it("writes the scope agn installs Claude Code's status line in", () => {
  const onClaudeStatusline = vi.fn();
  const { unmount } = section({ onClaudeStatusline });
  expect(optionLabels(openSelect("Claude Code status line"))).toEqual([
    "All sessions",
    "agn tasks only",
  ]);
  chooseOption(openSelect("Claude Code status line"), "agn tasks only");
  expect(onClaudeStatusline).toHaveBeenCalledWith("repo");
  unmount();
});

it("shows the page's own mono for a config.yaml with no font in it", () => {
  const { container, unmount } = section();
  expect(container.textContent).toContain("System mono");
  unmount();
});

it("shows a family set by hand that the list does not offer", () => {
  const { container, unmount } = section({ terminal: { font: "Cascadia Code", size: 13 } });
  expect(container.textContent).toContain("Cascadia Code");
  expect(TERMINAL_FONTS).not.toContain("Cascadia Code");
  unmount();
});
