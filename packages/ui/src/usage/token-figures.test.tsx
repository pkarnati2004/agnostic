// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render } from "../test/render";
import { TokenFigures } from "./token-figures";
import { claudePlan } from "./usage-response.fixture";

describe("TokenFigures", () => {
  it("shortens the token figures to what one cell holds", () => {
    const day = claudePlan({ usage: { ...claudePlan().usage, tokens: 2_100_000 } });
    const { container, unmount } = render(<TokenFigures day={day} week={null} vendor="claude" />);

    expect(container.textContent).toContain("today");
    expect(container.textContent).toContain("2.1M tok");
    unmount();
  });

  it("prices a window agn could price", () => {
    const day = claudePlan({ usage: { ...claudePlan().usage, tokens: 184_000, costUsd: 1.92 } });
    const { container, unmount } = render(<TokenFigures day={day} week={null} vendor={null} />);

    expect(container.textContent).toContain("184k tok · $1.92");
    unmount();
  });

  it("says the plan covered an unpriced window rather than leaving a gap", () => {
    const { container, unmount } = render(
      <TokenFigures day={claudePlan()} week={claudePlan()} vendor="claude" />,
    );

    expect(container.textContent).toContain("included in plan");
    unmount();
  });

  it("says nothing about a plan where no vendor bills the tokens", () => {
    const day = claudePlan({ vendor: null, plan: null });
    const { container, unmount } = render(<TokenFigures day={day} week={null} vendor={null} />);

    expect(container.textContent).not.toContain("included in plan");
    unmount();
  });

  it("drops a window nothing reported, rather than drawing a dash for it", () => {
    const { container, unmount } = render(
      <TokenFigures day={null} week={claudePlan()} vendor="claude" />,
    );

    expect(container.textContent).not.toContain("today");
    expect(container.textContent).toContain("week");
    unmount();
  });

  it("hides the week pair below the xl breakpoint rather than dropping it", () => {
    const { container, unmount } = render(
      <TokenFigures day={claudePlan()} week={claudePlan()} vendor="claude" />,
    );

    const week = container.querySelector("span.hidden.xl\\:contents");
    expect(week).not.toBe(null);
    expect(week?.textContent).toContain("week");
    unmount();
  });
});
