// @vitest-environment happy-dom
// The spec-step story lives in new-task-tab-spec.test.tsx; the shared helpers in the fixture.
import type { BudgetReport, RecommendRequest, RecommendResponse } from "@agnostic/core";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/error";
import { click } from "../test/render";
import { KEYED_PROFILE, PROFILE, REPO, stubClient } from "../test/workspace-fixture";
import {
  arrow,
  CODEX,
  press,
  prompt,
  recommendation,
  STARTED,
  tab,
  type,
} from "./new-task-tab-fixture";

const OVER_BUDGET: BudgetReport = {
  day: { limitUsd: 5, spentUsd: 5.2, state: "exceeded" },
  week: null,
};

const BUDGET_REFUSED = new ApiError("today's priced spend is $5.20, over the $5.00 daily budget", {
  code: "budget-exceeded",
  hint: "Pass --ignore-budget to run this task anyway, or raise budget.daily_usd in ~/.agnostic/config.yaml.",
  status: 409,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("NewTaskTab", () => {
  it("asks agn for its pick as a dry run once the typing stops", async () => {
    const asked: RecommendRequest[] = [];
    const { unmount } = tab(
      stubClient({
        recommend: (body) => {
          asked.push(body);
          return new Promise(() => undefined);
        },
      }),
    );
    await type();

    expect(asked).toEqual([{ repoId: REPO.id, prompt: "add a retry budget", dryRun: true }]);
    unmount();
  });

  it("runs on the pick when nothing else is chosen, and hands the task back", async () => {
    const runs: { repoId: string; body: unknown }[] = [];
    const onStarted = vi.fn();
    const { unmount } = tab(
      stubClient({
        recommend: () => Promise.resolve(recommendation(CODEX.id)),
        runTask: (repoId, body) => {
          runs.push({ repoId, body });
          return Promise.resolve({ task: STARTED });
        },
      }),
      { profiles: [PROFILE, CODEX], onStarted },
    );
    await type();
    await press(arrow());

    expect(runs).toEqual([
      { repoId: REPO.id, body: { prompt: "add a retry budget", profile: CODEX.id } },
    ]);
    expect(onStarted).toHaveBeenCalledWith(STARTED);
    unmount();
  });

  it("runs on the profile the user picked instead of the pick", async () => {
    const runs: unknown[] = [];
    const { unmount } = tab(
      stubClient({
        recommend: () => Promise.resolve(recommendation(PROFILE.id)),
        runTask: (_repoId, body) => {
          runs.push(body);
          return Promise.resolve({ task: STARTED });
        },
      }),
      { profiles: [PROFILE, KEYED_PROFILE] },
    );
    await type();
    act(() => (document.getElementById("new-task-profile") as HTMLButtonElement).click());
    const option = Array.from(document.querySelectorAll('[role="option"]')).find((one) =>
      one.textContent?.includes("API key"),
    ) as HTMLElement;
    act(() => option.click());
    await press(arrow());

    expect(runs).toEqual([{ prompt: "add a retry budget", profile: KEYED_PROFILE.id }]);
    unmount();
  });

  it("holds the arrow back until there is a prompt and a profile behind it", async () => {
    const { unmount } = tab(
      stubClient({ recommend: () => Promise.resolve(recommendation(PROFILE.id)) }),
    );
    expect(arrow().disabled).toBe(true);

    await type();

    expect(arrow().disabled).toBe(false);
    unmount();
  });

  it("replaces the prompt when the palette hands the open tab another one", async () => {
    const { reseed, unmount } = tab(stubClient(), { seed: { prompt: "port the parser", at: 1 } });
    expect(prompt().value).toBe("port the parser");

    await act(async () => reseed({ prompt: "add the invite links", at: 2 }));

    expect(prompt().value).toBe("add the invite links");
    unmount();
  });

  it("draws the first-run starter and the way to add a repo when there is none", () => {
    const { container, unmount } = tab(stubClient(), { mode: "empty", repos: [] });

    expect(container.textContent).toContain("What should an agent work on?");
    expect(container.textContent).toContain("Add a repo from this machine");
    expect(prompt().disabled).toBe(true);
    unmount();
  });

  it("marks the agents this machine has under the composer", () => {
    const { container, unmount } = tab(stubClient(), { profiles: [PROFILE, CODEX] });
    const marks = Array.from(container.querySelectorAll("[role='img']")).map((mark) =>
      mark.getAttribute("aria-label"),
    );

    expect(container.textContent).toContain("Detected");
    expect(marks).toEqual(["claude-code", "codex"]);
    unmount();
  });

  it("names the repo and what agn would do with its checkout", () => {
    const { container, unmount } = tab(stubClient());

    expect(container.textContent).toContain("This machine");
    expect(container.textContent).toContain("petal");
    expect(container.textContent).toContain("New worktree");
    unmount();
  });

  it("keeps the prompt and offers to ignore the budget when the run is refused for it", async () => {
    const runs: unknown[] = [];
    const { container, unmount } = tab(
      stubClient({
        recommend: () => Promise.resolve(recommendation(KEYED_PROFILE.id)),
        runTask: (_repoId, body) => {
          runs.push(body);
          return runs.length === 1
            ? Promise.reject(BUDGET_REFUSED)
            : Promise.resolve({ task: STARTED });
        },
      }),
      { profiles: [KEYED_PROFILE], budget: OVER_BUDGET },
    );
    await type();
    await press(arrow());

    expect(container.textContent).toContain("over the $5.00 daily budget");
    expect(prompt().value).toBe("add a retry budget");

    const ignore = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    click(ignore);
    await press(arrow());

    expect(runs).toEqual([
      { prompt: "add a retry budget", profile: KEYED_PROFILE.id },
      { prompt: "add a retry budget", profile: KEYED_PROFILE.id, ignoreBudget: true },
    ]);
    unmount();
  });

  it("drops a pick that lands after the prompt has already moved on", async () => {
    const asked: RecommendRequest[] = [];
    const pending: { resolve: (value: RecommendResponse) => void }[] = [];
    const { container, unmount } = tab(
      stubClient({
        recommend: (body) => {
          asked.push(body);
          if (asked.length === 1) {
            return new Promise<RecommendResponse>((resolve) => {
              pending.push({ resolve });
            });
          }
          return Promise.resolve(recommendation(CODEX.id));
        },
      }),
      { profiles: [PROFILE, CODEX] },
    );
    await type("add a retry budget");
    await type("port the parser instead");
    pending[0]?.resolve(recommendation(PROFILE.id));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(asked).toHaveLength(2);
    expect(container.textContent).toContain("codex");
    expect(container.textContent).not.toContain("claude-code · opus");
    unmount();
  });
});
