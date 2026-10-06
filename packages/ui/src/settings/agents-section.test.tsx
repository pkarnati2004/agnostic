// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { chooseOption, click, find, openSelect, render } from "../test/render";
import { AgentsSection } from "./agents-section";
import { doctorState, harnessReport, profile } from "./doctor-fixture";

const HARNESSES = [
  harnessReport(),
  harnessReport({ harness: "codex", path: "/opt/homebrew/bin/codex", version: "0.61.0" }),
  harnessReport({ harness: "gemini", path: null, version: null }),
  // A tier-2 row that is not installed has no row at all, as `agn doctor` has no line for it.
  harnessReport({ harness: "aider", tier: 2, path: null, version: null }),
];

const PROFILES = [
  profile(),
  profile({
    id: "opencode:kimi-k2.6:openrouter",
    harness: "opencode",
    model: "kimi-k2.6",
    route: "openrouter",
    billing: "credits",
  }),
];

function section() {
  const onSpecWriter = vi.fn();
  const view = render(
    <AgentsSection
      doctor={doctorState({ harnesses: HARNESSES, detectedAt: new Date().toISOString() })}
      profiles={PROFILES}
      specWriter={null}
      onSpecWriter={onSpecWriter}
    />,
  );
  return { ...view, onSpecWriter };
}

it("counts the agents it found and says when it looked", () => {
  const { container, unmount } = section();
  expect(container.textContent).toContain("2 of 3 found · checked just now");
  unmount();
});

it("keeps a row for a harness that is not on PATH", () => {
  const { container, unmount } = section();
  const text = container.textContent ?? "";
  expect(text).toContain("gemini");
  expect(text).toContain("Not on PATH");
  expect(text).toContain("2.4.1 · /opt/homebrew/bin/claude");
  // A tier-2 harness nobody installed is not the user's business here.
  expect(text).not.toContain("aider");
  unmount();
});

it("draws the profiles read-only: the box has no button in it", () => {
  const { container, unmount } = section();
  const text = container.textContent ?? "";
  expect(text).toContain("claude-code · fable");
  expect(text).toContain("opencode · kimi-k2.6");
  expect(text).toContain("openrouter");
  expect(text).toContain("credits");
  // Recheck is the section's only button, and it sits above the Profiles box.
  expect([...container.querySelectorAll("button")].map((b) => b.textContent)).not.toContain(
    "Add profile",
  );
  unmount();
});

it("says where the default profile is set, since it is not set here", () => {
  const { container, unmount } = section();
  expect(container.textContent).toContain("Default profile is set per repo in .ag/agnostic.yaml.");
  unmount();
});

it("asks the daemon to recheck when its button is clicked", () => {
  const recheck = vi.fn(() => Promise.resolve());
  const { container, unmount } = render(
    <AgentsSection
      doctor={{ ...doctorState({ harnesses: HARNESSES }), recheck }}
      profiles={PROFILES}
      specWriter={null}
      onSpecWriter={vi.fn()}
    />,
  );
  click(find(container, "button"));
  expect(recheck).toHaveBeenCalledTimes(1);
  unmount();
});

it("patches the spec writer the user picks from the select", () => {
  const onSpecWriter = vi.fn();
  const { unmount } = render(
    <AgentsSection
      doctor={doctorState({ harnesses: HARNESSES })}
      profiles={PROFILES}
      specWriter={null}
      onSpecWriter={onSpecWriter}
    />,
  );
  // The mark sits right before the id, as "CPro" does in the plans select.
  chooseOption(openSelect("Spec writer"), "Oopencode:kimi-k2.6:openrouter");
  expect(onSpecWriter).toHaveBeenCalledWith("opencode:kimi-k2.6:openrouter");
  unmount();
});

it("writes the spec writer the user picked", () => {
  const onSpecWriter = vi.fn();
  const { container, unmount } = render(
    <AgentsSection
      doctor={doctorState({ harnesses: HARNESSES })}
      profiles={[profile()]}
      specWriter="opencode:kimi-k2.6:openrouter"
      onSpecWriter={onSpecWriter}
    />,
  );
  // An id set by hand that this machine cannot run is still the select's value.
  expect(container.textContent).toContain("opencode:kimi-k2.6:openrouter");
  unmount();
});

it("offers the cheapest covered model when nothing is set", () => {
  const { container, unmount } = section();
  expect(container.textContent).toContain("Cheapest covered model");
  unmount();
});

it("says it is checking while the first detection is out", () => {
  const { container, unmount } = render(
    <AgentsSection
      doctor={doctorState(null)}
      profiles={[]}
      specWriter={null}
      onSpecWriter={vi.fn()}
    />,
  );
  expect(container.textContent).toContain("Checking…");
  unmount();
});
