// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { chooseOption, click, find, openSelect, render, typeInto } from "../test/render";
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

/** Three profiles across three harnesses, so a filter has something to leave out. */
const MANY = [
  ...PROFILES,
  profile({
    id: "codex:gpt-5.3-codex:native",
    harness: "codex",
    model: "gpt-5.3-codex",
    route: "native",
  }),
];

function section(profiles = PROFILES) {
  const onSpecWriter = vi.fn();
  const view = render(
    <AgentsSection
      doctor={doctorState({ harnesses: HARNESSES, detectedAt: new Date().toISOString() })}
      profiles={profiles}
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

function profileRows(container: HTMLElement): string[] {
  const rows = find(container, "[data-profile-rows]").children;
  return [...rows].map((row) => row.textContent ?? "");
}

function filter(container: HTMLElement, value: string): void {
  typeInto(find<HTMLInputElement>(container, 'input[aria-label="Filter profiles"]'), value);
}

it("narrows the profiles to the filter, and counts what it left", () => {
  const { container, unmount } = section(MANY);
  filter(container, "openrouter");
  expect(profileRows(container)).toHaveLength(1);
  expect(profileRows(container)[0]).toContain("opencode · kimi-k2.6");
  expect(container.textContent).toContain("1 of 3");
  unmount();
});

it("matches an id, a harness, a model or a route, whatever the case", () => {
  const { container, unmount } = section(MANY);
  filter(container, "CODEX");
  expect(profileRows(container)).toHaveLength(1);
  filter(container, "native");
  expect(profileRows(container)).toHaveLength(2);
  unmount();
});

it("restores every profile when the filter is cleared, and drops the count", () => {
  const { container, unmount } = section(MANY);
  filter(container, "codex");
  filter(container, "");
  expect(profileRows(container)).toHaveLength(3);
  // The count that would read "3 of 3" is gone, not stuck on screen.
  expect(container.textContent).not.toContain("3 of 3");
  unmount();
});

it("says so when the filter matches nothing", () => {
  const { container, unmount } = section(MANY);
  filter(container, "mistral");
  expect(container.textContent).toContain("No profiles match");
  expect(container.textContent).toContain("0 of 3");
  unmount();
});

it("scrolls the rows rather than growing the box past 320px", () => {
  const { container, unmount } = section();
  const scroller = find(container, "[data-profile-rows]");
  expect(scroller.className).toContain("max-h-80");
  expect(scroller.className).toContain("overflow-y-auto");
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
