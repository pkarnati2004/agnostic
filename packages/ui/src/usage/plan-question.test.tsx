// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { click, render } from "../test/render";
import { PlanQuestion } from "./plan-question";
import { planOptions } from "./usage-response.fixture";

function chips(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("button")).map((one) => one.textContent ?? "");
}

describe("PlanQuestion", () => {
  it("names the vendor it is asking about", () => {
    const { container, unmount } = render(
      <PlanQuestion vendor="claude" options={planOptions()} busy={false} onPick={vi.fn()} />,
    );

    expect(container.textContent).toContain("Which Claude plan are you on?");
    expect(container.querySelector('[aria-label="Claude plan"]')).not.toBe(null);
    unmount();
  });

  it("waits with a single ellipsis while detection is still running", () => {
    const { container, unmount } = render(
      <PlanQuestion vendor="claude" options={null} busy={false} onPick={vi.fn()} />,
    );

    expect(container.textContent).toContain("…");
    expect(chips(container)).toEqual([]);
    unmount();
  });

  it("offers this vendor's plans by their catalog names, and Other after them", () => {
    const { container, unmount } = render(
      <PlanQuestion vendor="claude" options={planOptions()} busy={false} onPick={vi.fn()} />,
    );

    expect(chips(container)).toEqual(["Pro", "Max 5x", "Max 20x", "Other"]);
    unmount();
  });

  it("answers with the plan id the daemon stores, not the name on the chip", () => {
    const onPick = vi.fn();
    const { container, unmount } = render(
      <PlanQuestion vendor="claude" options={planOptions()} busy={false} onPick={onPick} />,
    );

    click(container.querySelectorAll("button")[2] as Element);

    expect(onPick).toHaveBeenCalledWith("max20");
    unmount();
  });

  it("hands the command over for a plan the catalog does not list", () => {
    const { container, unmount } = render(
      <PlanQuestion vendor="claude" options={planOptions()} busy={false} onPick={vi.fn()} />,
    );

    click(container.querySelectorAll("button")[3] as Element);

    expect(container.querySelector("code")?.textContent).toBe("agn doctor --plan claude=<name>");
    expect(chips(container)).toEqual([]);
    unmount();
  });

  it("stops taking answers while the last one is being written", () => {
    const { container, unmount } = render(
      <PlanQuestion vendor="claude" options={planOptions()} busy={true} onPick={vi.fn()} />,
    );

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.every((one) => one.disabled)).toBe(true);
    unmount();
  });
});
