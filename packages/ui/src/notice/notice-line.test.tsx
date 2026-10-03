// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { find, render } from "../test/render";
import { NoticeLine, type NoticeTone } from "./notice-line";

const TONES: NoticeTone[] = ["question", "warning", "error", "info"];

describe("NoticeLine", () => {
  it("marks its tone and draws the icon that belongs to it", () => {
    for (const tone of TONES) {
      const { container, unmount } = render(
        <NoticeLine tone={tone}>Something happened.</NoticeLine>,
      );
      const line = find(container, "[data-tone]");
      expect(line.getAttribute("data-tone")).toBe(tone);
      expect(line.querySelector("svg")).not.toBeNull();
      expect(line.textContent).toContain("Something happened.");
      unmount();
    }
  });

  it("reads a failure out as an alert and everything else as a status", () => {
    const failed = render(<NoticeLine tone="error">Could not read the config.</NoticeLine>);
    expect(find(failed.container, "[data-tone]").getAttribute("role")).toBe("alert");
    failed.unmount();

    for (const tone of ["question", "warning", "info"] as NoticeTone[]) {
      const { container, unmount } = render(<NoticeLine tone={tone}>A note.</NoticeLine>);
      expect(find(container, "[data-tone]").getAttribute("role")).toBe("status");
      unmount();
    }
  });

  it("takes the role the caller asks for instead", () => {
    const { container, unmount } = render(
      <NoticeLine tone="question" role="alert">
        The agent asked a question.
      </NoticeLine>,
    );
    expect(find(container, "[data-tone]").getAttribute("role")).toBe("alert");
    unmount();
  });

  it("colours each tone's icon by its own token, not a shared one", () => {
    const TOKEN: Record<NoticeTone, string> = {
      question: "--status-waiting",
      warning: "--warning",
      error: "--destructive",
      info: "--muted-foreground",
    };
    for (const tone of TONES) {
      const { container, unmount } = render(<NoticeLine tone={tone}>A note.</NoticeLine>);
      const icon = find(container, "svg") as SVGElement;
      expect(icon.style.color).toBe(`var(${TOKEN[tone]})`);
      unmount();
    }
  });

  it("draws what the caller offers to do about it", () => {
    const { container, unmount } = render(
      <NoticeLine tone="warning" action={<button type="button">Update now</button>}>
        The catalog is nine days old.
      </NoticeLine>,
    );
    expect(find(container, "button").textContent).toBe("Update now");
    unmount();
  });
});
