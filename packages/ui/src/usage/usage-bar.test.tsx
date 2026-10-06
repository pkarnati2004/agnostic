// @vitest-environment happy-dom
import type { DoctorRequest, UsageResponse } from "@agnostic/core";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { TooltipProvider } from "../components/tooltip";
import { click, render } from "../test/render";
import { UsageBar } from "./usage-bar";
import {
  claudeLimit,
  claudePlan,
  doctorResponse,
  presentPlan,
  subscriptionTaskUsage,
  usageResponse,
} from "./usage-response.fixture";
import type { UsageState } from "./usage-state";

const IDLE: UsageState = { kind: "idle" };

afterEach(() => {
  vi.useRealTimers();
});

function stubClient(calls: DoctorRequest[] = []): WorkspaceClient {
  return {
    doctor: (body: DoctorRequest) => {
      calls.push(body);
      return Promise.resolve(doctorResponse());
    },
  } as unknown as WorkspaceClient;
}

function footer(container: HTMLElement): HTMLElement {
  const found = container.querySelector("footer");
  if (found === null) {
    throw new Error("no footer drawn");
  }
  return found;
}

/** A few empty microtask turns: enough for a passive effect and a resolved promise to settle. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("UsageBar cells", () => {
  const loaded = (response: UsageResponse): UsageState => ({
    kind: "ready",
    response,
    fetchedAt: 1_000,
  });

  function bar(
    state: UsageState,
    over: { client?: WorkspaceClient; showTask?: boolean; refresh?: () => void } = {},
  ) {
    return render(
      <TooltipProvider>
        <UsageBar
          state={state}
          flash={0}
          taskUsage={subscriptionTaskUsage}
          showTask={over.showTask ?? false}
          client={over.client ?? stubClient()}
          refresh={over.refresh ?? (() => undefined)}
        />
      </TooltipProvider>,
    );
  }

  /** One Claude plan with its meter current, so nothing else in the bar asks a question. */
  function claudeOnly(fableShare: number | null, plan: string | null = "max20"): UsageResponse {
    const day = [claudePlan({ plan, fableShare })];
    return usageResponse(day, day, { day: null, week: null }, [claudeLimit()]);
  }

  it("draws each plan's own meter where a file on this machine reports one", () => {
    const { container, unmount } = bar(loaded(claudeOnly(null)));

    expect(footer(container).textContent).toContain("5h58%");
    unmount();
  });

  it("says nothing about Fable in the cell (ADR 029, 2026-09-30)", () => {
    const { container, unmount } = bar(loaded(claudeOnly(0.22)));

    expect(footer(container).textContent?.toLowerCase()).not.toContain("fable");
    unmount();
  });

  it("puts the agents with no usage after the plan cells and before the budget", () => {
    const day = [claudePlan()];
    const response = usageResponse(
      day,
      day,
      { day: { limitUsd: 20, spentUsd: 4, state: "ok" }, week: null },
      [claudeLimit()],
      ["kimi"],
    );
    const { container, unmount } = bar(loaded(response));

    const cells = [...footer(container).querySelectorAll("[data-cell]")].map((node) =>
      node.getAttribute("data-cell"),
    );

    expect(cells).toEqual(["plan", "unavailable", "budget"]);
    expect(footer(container).textContent).toContain("no usage: Kimi CLI");
    unmount();
  });

  it("draws no cell at all when every agent agn found records its usage", () => {
    const { container, unmount } = bar(loaded(claudeOnly(null)));

    expect(footer(container).querySelector('[data-cell="unavailable"]')).toBeNull();
    unmount();
  });

  it("keeps the task's own figures for a task tab and nothing else", () => {
    const shown = bar(loaded(claudeOnly(null)), { showTask: true });
    expect(footer(shown.container).textContent).toContain("This task");
    shown.unmount();

    const hidden = bar(loaded(claudeOnly(null)));
    expect(footer(hidden.container).textContent).not.toContain("This task");
    hidden.unmount();
  });

  it("asks for the plan options once, and only for a plan agn cannot name", async () => {
    const calls: DoctorRequest[] = [];
    const { container, unmount } = bar(loaded(claudeOnly(null, null)), {
      client: stubClient(calls),
    });
    await flush();

    expect(calls).toEqual([{}]);
    expect(footer(container).textContent).toContain("Which Claude plan are you on?");
    unmount();
  });

  it("never asks the daemon while every plan is known", async () => {
    const calls: DoctorRequest[] = [];
    const { unmount } = bar(loaded(claudeOnly(null)), { client: stubClient(calls) });
    await flush();

    expect(calls).toEqual([]);
    unmount();
  });

  it("asks the daemon once even though two cells cannot name their plan", async () => {
    const calls: DoctorRequest[] = [];
    const day = [
      claudePlan({ plan: null }),
      claudePlan({ harness: "codex", vendor: "chatgpt", plan: null }),
    ];
    const { container, unmount } = bar(loaded(usageResponse(day, day)), {
      client: stubClient(calls),
    });
    await flush();

    expect(calls).toEqual([{}]);
    const questions = footer(container).querySelectorAll('[data-state="unknown"]');
    expect(questions.length).toBe(2);
    unmount();
  });

  it("keeps the question at '…' with no error line when detection itself fails", async () => {
    const calls: DoctorRequest[] = [];
    const failing: WorkspaceClient = {
      doctor: (body: DoctorRequest) => {
        calls.push(body);
        return Promise.reject(new Error("doctor is not answering"));
      },
    } as unknown as WorkspaceClient;
    const { container, unmount } = bar(loaded(claudeOnly(null, null)), { client: failing });
    await flush();

    expect(calls).toEqual([{}]);
    const text = footer(container).textContent ?? "";
    expect(text).toContain("Which Claude plan are you on?");
    expect(text).toContain("…");
    expect(footer(container).querySelector('[role="alert"]')).toBe(null);
    unmount();
  });

  it("writes the plan the user picked, then re-reads the figures", async () => {
    const calls: DoctorRequest[] = [];
    const refresh = vi.fn();
    const { container, unmount } = bar(loaded(claudeOnly(null, null)), {
      client: stubClient(calls),
      refresh,
    });
    await flush();

    const chips = Array.from(footer(container).querySelectorAll("button"));
    click(chips[2] as Element);
    await flush();

    expect(calls).toEqual([{}, { plans: { claude: "max20" } }]);
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
  });

  /**
   * The Monday after a Saturday Codex turn: the week window counted only Claude, and Codex and
   * Cursor Agent are still installed. Codex's rollout reported its percentages; nothing reports
   * Cursor's.
   */
  function mondayMorning(): UsageResponse {
    const day = [claudePlan()];
    const present = [
      presentPlan({ harness: "cursor-agent", vendor: "cursor", plan: "pro" }),
      presentPlan(),
      presentPlan({ harness: "claude-code", vendor: "claude", plan: "max20" }),
    ];
    return usageResponse(
      day,
      day,
      { day: null, week: null },
      [claudeLimit(), claudeLimit({ harness: "codex", vendor: "chatgpt" })],
      [],
      present,
    );
  }

  function planCells(container: HTMLElement): Element[] {
    return [...footer(container).querySelectorAll('[data-cell="plan"]')];
  }

  it("keeps a cell for an installed agent neither window counted, after the ones that spent", () => {
    const { container, unmount } = bar(loaded(mondayMorning()));

    expect(planCells(container).map((node) => node.getAttribute("data-vendor"))).toEqual([
      "claude",
      "chatgpt",
      "cursor",
    ]);
    unmount();
  });

  it("shows a present agent's percentages where a file reports them, and no tokens", () => {
    const { container, unmount } = bar(loaded(mondayMorning()));
    const codex = planCells(container)[1];

    expect(codex?.getAttribute("data-state")).toBe("percent");
    expect(codex?.textContent).toContain("58%");
    expect(codex?.textContent).not.toContain("tok");
    unmount();
  });

  it("says a present agent with nothing to report counted nothing this week", () => {
    const { container, unmount } = bar(loaded(mondayMorning()));
    const cursor = planCells(container)[2];

    expect(cursor?.getAttribute("data-state")).toBe("empty");
    expect(cursor?.textContent).toContain("nothing this week");
    unmount();
  });

  it("leaves an agent with no usage source in the unavailable cell and out of the plan cells", () => {
    const day = [claudePlan()];
    const present = [presentPlan({ harness: "claude-code", vendor: "claude", plan: "max20" })];
    const response = usageResponse(day, day, { day: null, week: null }, [], ["kimi"], present);
    const { container, unmount } = bar(loaded(response));

    expect(planCells(container).length).toBe(1);
    expect(footer(container).textContent).toContain("no usage: Kimi CLI");
    unmount();
  });

  it("says it is reading before the first body lands", () => {
    const { container, unmount } = bar(IDLE);

    expect(footer(container).textContent).toBe("reading usage…");
    unmount();
  });

  it("says a day with no plan row is a day with no usage", () => {
    const { container, unmount } = bar(loaded(usageResponse([], [])));

    expect(footer(container).textContent).toContain("no usage today");
    unmount();
  });
});
