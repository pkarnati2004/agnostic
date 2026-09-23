// @vitest-environment happy-dom
import type { BudgetReport, Profile } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { click, render } from "../test/render";
import { BudgetNote } from "./budget-note";
import { PROFILE } from "./new-task-dialog-fixture";

const KEYED: Profile = { ...PROFILE, id: "claude-code:opus:openrouter", billing: "api-key" };

const WARN: BudgetReport = { day: { limitUsd: 5, spentUsd: 4.1, state: "warn" }, week: null };
const OVER: BudgetReport = { day: { limitUsd: 5, spentUsd: 5.2, state: "exceeded" }, week: null };

function note(budget: BudgetReport | null, profile: Profile | null, onIgnore = vi.fn()) {
  return {
    ...render(<BudgetNote budget={budget} profile={profile} ignore={false} onIgnore={onIgnore} />),
    onIgnore,
  };
}

describe("BudgetNote", () => {
  it("says nothing when there is no budget, no profile, or nothing spent", () => {
    for (const drawn of [
      note(null, KEYED),
      note(WARN, null),
      note({ day: { limitUsd: 5, spentUsd: 1, state: "ok" }, week: null }, KEYED),
    ]) {
      expect(drawn.container.textContent).toBe("");
      drawn.unmount();
    }
  });

  it("says nothing for a subscription profile, however much was spent", () => {
    const drawn = note(OVER, PROFILE);
    expect(drawn.container.textContent).toBe("");
    drawn.unmount();
  });

  it("warns for a profile billed by the token", () => {
    const drawn = note(WARN, KEYED);
    expect(drawn.container.textContent).toBe("Budget: today $4.10 of $5.00 (82%).");
    expect(drawn.container.querySelector("input")).toBeNull();
    drawn.unmount();
  });

  it("says a run would be refused, and offers to ignore the budget once", () => {
    const drawn = note(OVER, KEYED);
    expect(drawn.container.textContent).toContain("Over budget: today $5.20 of $5.00.");
    expect(drawn.container.textContent).toContain("refused for api-key and credits profiles");
    const box = drawn.container.querySelector("input");
    expect(box?.getAttribute("type")).toBe("checkbox");
    click(box as HTMLInputElement);
    expect(drawn.onIgnore).toHaveBeenCalledWith(true);
    drawn.unmount();
  });

  it("names both windows when both are over", () => {
    const drawn = note(
      {
        day: { limitUsd: 5, spentUsd: 5.2, state: "exceeded" },
        week: { limitUsd: 20, spentUsd: 21, state: "exceeded" },
      },
      KEYED,
    );
    expect(drawn.container.textContent).toContain("Over budget: today $5.20 of $5.00.");
    expect(drawn.container.textContent).toContain("this week $21.00 of $20.00.");
    drawn.unmount();
  });
});
