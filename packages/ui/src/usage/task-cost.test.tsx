// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render } from "../test/render";
import { TaskCost } from "./task-cost";
import { meteredTaskUsage, subscriptionTaskUsage } from "./usage-response.fixture";

describe("TaskCost", () => {
  it("says the subscription covered the task rather than printing a dash", () => {
    const { container, unmount } = render(<TaskCost usage={subscriptionTaskUsage} />);

    expect(container.textContent).toBe("This task1.2M tok · included in plan");
    unmount();
  });

  it("prices a task the user pays for by the token", () => {
    const { container, unmount } = render(<TaskCost usage={meteredTaskUsage} />);

    expect(container.textContent).toContain("1.2M tok · $1.50");
    unmount();
  });

  it("says a task has spent nothing yet, rather than showing it zero", () => {
    const usage = {
      ...subscriptionTaskUsage,
      usage: { ...subscriptionTaskUsage.usage, tokens: 0 },
    };

    const { container, unmount } = render(<TaskCost usage={usage} />);

    expect(container.textContent).toBe("This taskno usage yet");
    unmount();
  });

  it("says the same before the first read lands", () => {
    const { container, unmount } = render(<TaskCost usage={null} />);

    expect(container.textContent).toContain("no usage yet");
    unmount();
  });
});
