// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render } from "../test/render";
import { DaemonFooter } from "./daemon-footer";

describe("DaemonFooter", () => {
  it("names the daemon answering the page", () => {
    const { container, unmount } = render(<DaemonFooter version="1.2.0" connection="live" />);
    expect(container.textContent).toBe("agnd runningv1.2.0");
    unmount();
  });

  it("says the daemon is not running the moment the feed drops", () => {
    const { container, unmount } = render(
      <DaemonFooter version="1.2.0" connection="reconnecting" />,
    );
    expect(container.textContent).toBe("agnd not running");
    unmount();
  });

  it("leaves the version out until `GET /health` has answered", () => {
    const { container, unmount } = render(<DaemonFooter version={null} connection="live" />);
    expect(container.textContent).toBe("agnd running");
    unmount();
  });
});
