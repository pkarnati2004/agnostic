// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../components/tooltip";
import { click, find, render } from "../test/render";
import type { DaemonState } from "./daemon-footer";
import { DaemonFooter } from "./daemon-footer";

function footer(daemon: DaemonState) {
  const onSettings = vi.fn();
  return {
    onSettings,
    ...render(
      <TooltipProvider>
        <DaemonFooter {...daemon} onSettings={onSettings} />
      </TooltipProvider>,
    ),
  };
}

describe("DaemonFooter", () => {
  it("names the daemon answering the page", () => {
    const { container, unmount } = footer({ version: "1.2.0", connection: "live" });
    expect(container.textContent).toContain("agnd running");
    expect(container.textContent).toContain("v1.2.0");
    unmount();
  });

  it("says the daemon is not running the moment the feed drops", () => {
    const { container, unmount } = footer({ version: "1.2.0", connection: "reconnecting" });
    expect(container.textContent).toContain("agnd not running");
    expect(container.textContent).not.toContain("v1.2.0");
    unmount();
  });

  it("leaves the version out until `GET /health` has answered", () => {
    const { container, unmount } = footer({ version: null, connection: "live" });
    expect(container.textContent).toContain("agnd running");
    unmount();
  });

  it("opens Settings from the gear at the right end", () => {
    const { container, onSettings, unmount } = footer({ version: "1.2.0", connection: "live" });
    click(find(container, 'button[aria-label="Settings"]'));
    expect(onSettings).toHaveBeenCalledOnce();
    unmount();
  });
});
