// @vitest-environment happy-dom
import type { Profile } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "../test/render";
import { PROFILE } from "../test/workspace-fixture";
import { ProfileSelect } from "./profile-select";

const CODEX: Profile = {
  ...PROFILE,
  id: "codex:gpt-5.6:native",
  harness: "codex",
  model: "gpt-5.6",
  billing: "credits",
};

const GONE: Profile = {
  ...PROFILE,
  id: "gemini:gemini-3-pro:native",
  harness: "gemini",
  model: "gemini-3-pro",
  available: false,
};

function open(props: Partial<Parameters<typeof ProfileSelect>[0]> = {}) {
  const rendered = render(
    <ProfileSelect
      id="pick"
      profiles={[CODEX, PROFILE, GONE]}
      value={null}
      recommendedId={PROFILE.id}
      onChange={props.onChange ?? vi.fn()}
      placeholder="Profile: recommended"
      {...props}
    />,
  );
  const trigger = document.getElementById("pick") as HTMLButtonElement;
  act(() => trigger.click());
  return rendered;
}

function options(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[role="option"]'));
}

describe("ProfileSelect", () => {
  it("puts agn's pick first, under a heading that says it is the pick", () => {
    const { unmount } = open();

    expect(document.body.textContent).toContain("Recommended");
    expect(document.body.textContent).toContain("Your profiles");
    expect(options()[0]?.textContent).toContain("claude-code · opus");
    unmount();
  });

  it("leaves out what this machine cannot run", () => {
    const { unmount } = open();

    expect(options()).toHaveLength(2);
    expect(document.body.textContent).not.toContain("gemini-3-pro");
    unmount();
  });

  it("names what a profile costs beside it", () => {
    const { unmount } = open();

    expect(options()[0]?.textContent).toContain("included in plan");
    expect(options()[1]?.textContent).toContain("credits");
    unmount();
  });

  it("offers the one worth trying, disabled, with the step that would enable it", () => {
    const { unmount } = open({ unavailable: { profileId: GONE.id, enable: "GEMINI_API_KEY" } });
    const worthTrying = options().find((option) => option.textContent?.includes("needs"));

    expect(worthTrying?.textContent).toContain("needs GEMINI_API_KEY");
    expect(worthTrying?.getAttribute("aria-disabled")).toBe("true");
    unmount();
  });

  it("hands back the id that was clicked", () => {
    const onChange = vi.fn();
    const { unmount } = open({ onChange });

    act(() => options()[1]?.click());

    expect(onChange).toHaveBeenCalledWith(CODEX.id);
    unmount();
  });

  it("sets the field-width trigger in mono, since a profile id is not prose", () => {
    const { unmount } = open();
    expect(document.getElementById("pick")?.className).toContain("type-mono-lg");
    unmount();
  });

  it("leaves the composer's chip trigger out of the mono type", () => {
    const { unmount } = open({ size: "chip" });
    expect(document.getElementById("pick")?.className).not.toContain("type-mono-lg");
    unmount();
  });

  it("reads the placeholder with nothing picked, and the chip once one is", () => {
    const { unmount } = open();
    expect(document.getElementById("pick")?.textContent).toContain("Profile: recommended");
    unmount();

    const picked = render(
      <ProfileSelect
        id="pick2"
        profiles={[CODEX, PROFILE]}
        value={CODEX.id}
        recommendedId={PROFILE.id}
        onChange={vi.fn()}
        placeholder="Profile: recommended"
      />,
    );
    expect(document.getElementById("pick2")?.textContent).toContain("codex · gpt-5.6");
    picked.unmount();
  });
});
