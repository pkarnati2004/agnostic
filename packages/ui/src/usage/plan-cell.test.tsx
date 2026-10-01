// @vitest-environment happy-dom
import type { PlanLimit, PlanUsage, PlanVendor } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "../components/tooltip";
import { render } from "../test/render";
import { PlanCell } from "./plan-cell";
import { claudeLimit, claudePlan, usageResponse } from "./usage-response.fixture";

const NOW = Date.parse(usageResponse().scannedAt);

/** The figures the panel's tokens line is written from: 274M this week, 105M today. */
const WEEK = claudePlan({
  usage: { ...claudePlan().usage, tokens: 273_900_000 },
  unattributedTokens: 273_900_000 - 12_100_000,
  fableShare: null,
});

const DAY = claudePlan({
  usage: { ...claudePlan().usage, tokens: 105_400_000 },
  unattributedTokens: 105_400_000 - 3_200_000,
  fableShare: null,
});

type Opts = {
  vendor?: PlanVendor | null;
  limit?: PlanLimit | null;
  day?: PlanUsage | null;
  week?: PlanUsage | null;
};

/** Opens a Radix tooltip: a real hover needs the pointer events its trigger listens for. */
async function hover(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(
      new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" }),
    );
    element.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

async function panel(opts: Opts = {}) {
  const { container, unmount } = render(
    <TooltipProvider delayDuration={0}>
      <PlanCell
        label="claude max20"
        vendor={opts.vendor === undefined ? "claude" : opts.vendor}
        limit={opts.limit === undefined ? claudeLimit() : opts.limit}
        day={opts.day === undefined ? DAY : opts.day}
        week={opts.week === undefined ? WEEK : opts.week}
        now={NOW}
      />
    </TooltipProvider>,
  );
  await hover(container.querySelector("div") as Element);
  const content = document.body.querySelector<HTMLElement>('[data-slot="tooltip-content"]');
  if (content === null) {
    throw new Error("the tooltip did not open");
  }
  const line = (name: string) => content.querySelector<HTMLElement>(`[data-line="${name}"]`);
  return { content, line, unmount };
}

/** `observedAt` as a number of minutes before the fixture's scan time. */
function observed(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

describe("PlanCell's tooltip", () => {
  it("draws the panel's blocks in order: rows, age, tokens, cost", async () => {
    const open = await panel({ limit: claudeLimit({ observedAt: observed(180) }) });

    const order = [...open.content.querySelectorAll("[data-line]")].map((block) =>
      block.getAttribute("data-line"),
    );

    expect(order).toEqual(["rows", "age", "tokens", "cost"]);
    open.unmount();
  });

  it("takes one width whatever it holds, and wraps the lines that do not fit", async () => {
    const wide = await panel();

    expect(wide.content.style.width).toBe("320px");
    expect(wide.content.className).toContain("whitespace-normal");
    wide.unmount();

    const narrow = await panel({ day: null, week: null, vendor: "chatgpt" });

    expect(narrow.content.textContent).not.toContain("tokens");
    expect(narrow.content.style.width).toBe("320px");
    narrow.unmount();
  });

  it("dates the rows once the figure is three hours old, and never the tokens", async () => {
    const open = await panel({ limit: claudeLimit({ observedAt: observed(180) }) });

    expect(open.line("age")?.textContent).toBe("as of 3 h ago");
    expect(open.line("tokens")?.textContent).not.toContain("as of");
    open.unmount();
  });

  it("says nothing about the age of a figure from the last two minutes", async () => {
    const open = await panel({ limit: claudeLimit({ observedAt: observed(2) }) });

    expect(open.line("age")).toBeNull();
    open.unmount();
  });

  it("keeps the window rows when every window is stale, with a dash each and the age", async () => {
    const past = new Date(NOW - 2 * 24 * 60 * 60_000).toISOString();
    const open = await panel({
      limit: claudeLimit({
        fiveHour: { usedPercent: 58, resetsAt: past, freshness: "stale" },
        week: { usedPercent: 41, resetsAt: past, freshness: "stale" },
        observedAt: observed(2 * 24 * 60),
      }),
    });

    expect(open.line("rows")?.textContent).toBe("5-hour window–This week–");
    expect(open.line("age")?.textContent).toBe("as of 2 d ago");
    open.unmount();
  });

  it("leaves the rows out when nothing on this machine reported a limit", async () => {
    const open = await panel({ limit: null });

    expect(open.line("rows")).toBeNull();
    expect(open.line("age")).toBeNull();
    expect(open.line("tokens")?.textContent).toContain("274M tokens this week");
    open.unmount();
  });

  it("tildes the rows on an approximate figure and leaves the tokens line alone", async () => {
    const open = await panel({ limit: claudeLimit({ observedAt: observed(180) }) });

    expect(open.line("rows")?.textContent).toContain("~58% used");
    expect(open.line("tokens")?.textContent).not.toContain("~");
    open.unmount();
  });

  it("writes the token counts to three significant figures, with agn's own share", async () => {
    const open = await panel();

    expect(open.line("tokens")?.textContent).toBe(
      "274M tokens this week, 12.1M by agn · 105M today, 3.2M by agn",
    );
    open.unmount();
  });

  it("leaves out 'by agn' when every token in the window is agn's", async () => {
    const open = await panel({
      week: claudePlan({ ...WEEK, unattributedTokens: 0 }),
      day: claudePlan({ ...DAY, unattributedTokens: 0 }),
    });

    expect(open.line("tokens")?.textContent).toBe("274M tokens this week · 105M today");
    open.unmount();
  });

  it("names the Fable share as a share of tokens, not a limit (ADR 029, 2026-09-30)", async () => {
    const open = await panel({ week: claudePlan({ ...WEEK, fableShare: 0.22 }) });

    expect(open.line("tokens")?.textContent).toContain("· Fable 22% of counted tokens");
    expect(open.line("rows")?.textContent?.toLowerCase()).not.toContain("fable");
    open.unmount();
  });

  it("prices a subscription plan's tokens at API rates and says nothing is billed", async () => {
    const open = await panel();

    expect(open.line("cost")?.textContent).toBe("≈ $12.40 at API rates, not billed");
    expect(open.content.textContent).not.toContain("$12.40 this week");
    open.unmount();
  });

  it("leaves the cost line out when a plan's tokens cannot be priced", async () => {
    const open = await panel({ week: claudePlan({ ...WEEK, apiRateUsd: null }) });

    expect(open.line("cost")).toBeNull();
    open.unmount();
  });

  it("shows a metered plan's real cost instead", async () => {
    const open = await panel({
      vendor: null,
      week: claudePlan({ ...WEEK, vendor: null, usage: { ...WEEK.usage, costUsd: 1.92 } }),
      day: claudePlan({ ...DAY, vendor: null, usage: { ...DAY.usage, costUsd: 0.4 } }),
    });

    expect(open.line("cost")?.textContent).toBe("$1.92 this week · $0.40 today");
    expect(open.content.textContent).not.toContain("≈");
    open.unmount();
  });

  it("draws no rows and no age line for a plan nothing on this machine reports a limit for", async () => {
    const open = await panel({ limit: null });

    expect(open.line("rows")).toBeNull();
    expect(open.line("age")).toBeNull();
    expect(open.line("tokens")).not.toBeNull();
    open.unmount();
  });
});
