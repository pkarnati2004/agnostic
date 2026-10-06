// @vitest-environment happy-dom
import type { HealthResponse } from "@agnostic/core";
import { expect, it, vi } from "vitest";
import { render } from "../test/render";
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
