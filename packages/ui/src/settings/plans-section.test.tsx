// @vitest-environment happy-dom
import type { ApiKeyReport } from "@agnostic/core";
import { expect, it, vi } from "vitest";
import { chooseOption, openSelect, optionLabels, render } from "../test/render";
import { doctorState } from "./doctor-fixture";
import { PlansSection } from "./plans-section";

const KEYS: ApiKeyReport[] = [
  { name: "OPENROUTER_API_KEY", set: true, usedBy: ["pi", "opencode"] },
  { name: "GEMINI_API_KEY", set: false, usedBy: ["gemini"] },
];

it("offers each vendor only its own plans", () => {
  const { unmount } = render(<PlansSection doctor={doctorState({ plans: { claude: "max20" } })} />);
  // Each option carries its vendor's mark, which is one letter in front of the plan's name.
  expect(optionLabels(openSelect("Claude plan"))).toEqual(["CPro", "CMax 5x", "CMax 20x"]);
  unmount();
  const second = render(<PlansSection doctor={doctorState({})} />);
  expect(optionLabels(openSelect("ChatGPT plan"))).toEqual(["XPlus"]);
  second.unmount();
});

it("writes the plan the user picked for that vendor", () => {
  const setPlan = vi.fn(() => Promise.resolve());
  const { unmount } = render(<PlansSection doctor={{ ...doctorState({}), setPlan }} />);
  chooseOption(openSelect("Claude plan"), "CMax 20x");
  expect(setPlan).toHaveBeenCalledWith("claude", "max20");
  unmount();
});

it("shows a key as set or not set, and never its value", () => {
  const { container, unmount } = render(<PlansSection doctor={doctorState({ keys: KEYS })} />);
  const text = container.textContent ?? "";
  expect(text).toContain("OPENROUTER_API_KEY");
  expect(text).toContain("Used by pi, opencode");
  expect(text).toContain("Set in environment");
  expect(text).toContain("GEMINI_API_KEY");
  expect(text).toContain("Not set");
  // The report carries presence and nothing else, so there is no value on the page to find.
  expect(container.textContent).not.toMatch(/sk-|or-/);
  unmount();
});

it("says where a key is read from and how to add one", () => {
  const { container, unmount } = render(<PlansSection doctor={doctorState({ keys: KEYS })} />);
  const text = container.textContent ?? "";
  expect(text).toContain("Read from the environment agnd was started in.");
  expect(text).toContain("Export a key in the shell that starts agnd, then agn daemon restart.");
  unmount();
});

it("says it is checking while the first detection is out", () => {
  const { container, unmount } = render(<PlansSection doctor={doctorState(null)} />);
  expect(container.textContent).toContain("Checking…");
  unmount();
});
