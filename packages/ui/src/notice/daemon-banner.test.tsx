// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { click, find, render } from "../test/render";
import { DaemonBanner } from "./daemon-banner";

describe("DaemonBanner", () => {
  it("says nothing while the page is talking to the daemon", () => {
    const { container, unmount } = render(<DaemonBanner shown={false} onRetry={vi.fn()} />);
    expect(container.textContent).toBe("");
    unmount();
  });

  it("names the command that starts the daemon, and says the agents are still running", () => {
    const { container, unmount } = render(<DaemonBanner shown onRetry={vi.fn()} />);
    expect(container.textContent).toContain("agnd is not running");
    expect(find(container, "code").textContent).toBe("agn daemon start");
    expect(container.textContent).toContain("Agents keep running in tmux meanwhile.");
    unmount();
  });

  it("asks the page to open the feed again", () => {
    const onRetry = vi.fn();
    const { container, unmount } = render(<DaemonBanner shown onRetry={onRetry} />);
    click(find(container, "button"));
    expect(onRetry).toHaveBeenCalledOnce();
    unmount();
  });
});
