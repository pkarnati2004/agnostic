// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { HintText } from "./hint-text";
import { render } from "./test/render";

describe("HintText", () => {
  it("shows the command as code, not as the backticks around it", () => {
    const { container, unmount } = render(
      <HintText hint="Run `agn stop task1` first, then clean it." />,
    );
    expect(container.textContent).toBe("Run agn stop task1 first, then clean it.");
    expect([...container.querySelectorAll("code")].map((el) => el.textContent)).toEqual([
      "agn stop task1",
    ]);
    unmount();
  });

  it("leaves a hint with no command, and an unclosed backtick, as it was written", () => {
    const { container, unmount } = render(<HintText hint="Check the log at ~/.agnostic/logs." />);
    expect(container.textContent).toBe("Check the log at ~/.agnostic/logs.");
    expect(container.querySelector("code")).toBeNull();
    unmount();

    const lone = render(<HintText hint="A stray ` is text." />);
    expect(lone.container.textContent).toBe("A stray ` is text.");
    expect(lone.container.querySelector("code")).toBeNull();
    lone.unmount();
  });

  it("marks every command in a hint that names two", () => {
    const { container, unmount } = render(
      <HintText hint="Run `agn repo open r1`, then `agn run`." />,
    );
    expect([...container.querySelectorAll("code")].map((el) => el.textContent)).toEqual([
      "agn repo open r1",
      "agn run",
    ]);
    unmount();
  });
});
