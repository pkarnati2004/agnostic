// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { find, render } from "../test/render";
import { ProfileChip } from "./profile-chip";

describe("ProfileChip", () => {
  it("names the harness and the model, with one badge for what it costs", () => {
    const { container, unmount } = render(
      <ProfileChip profileId="claude-code:fable:native" billing="subscription" />,
    );
    expect(container.textContent).toContain("claude-code · fable");
    expect(container.querySelectorAll("[data-slot='badge']")).toHaveLength(1);
    expect(container.textContent).toContain("included in plan");
    expect(find(container, "[title]").getAttribute("title")).toBe("claude-code:fable:native");
    unmount();
  });

  it("gives the badge to the route when the model does not run on the harness's own", () => {
    const { container, unmount } = render(
      <ProfileChip profileId="opencode:kimi-k2.6:openrouter" billing="credits" />,
    );
    expect(container.textContent).toContain("openrouter");
    expect(container.textContent).not.toContain("credits");
    expect(container.querySelectorAll("[data-slot='badge']")).toHaveLength(1);
    unmount();
  });

  it("carries both badges over a compare column, where there is room", () => {
    const { container, unmount } = render(
      <ProfileChip profileId="opencode:kimi-k2.6:openrouter" billing="credits" variant="column" />,
    );
    expect(container.textContent).toContain("openrouter");
    expect(container.textContent).toContain("credits");
    unmount();
  });

  it("names the harness alone when the profile runs on its default model", () => {
    const { container, unmount } = render(<ProfileChip profileId="codex:default:native" />);
    expect(container.textContent).toBe("Xcodex");
    unmount();
  });

  it("truncates the model name by CSS rather than wrapping, with the full id in the title", () => {
    const { container, unmount } = render(
      <ProfileChip profileId="claude-code:a-very-long-model-name-that-would-not-fit:native" />,
    );
    const label = find(container, "span.truncate");
    expect(label.textContent).toBe("claude-code · a-very-long-model-name-that-would-not-fit");
    expect(find(container, "[title]").getAttribute("title")).toBe(
      "claude-code:a-very-long-model-name-that-would-not-fit:native",
    );
    unmount();
  });

  it("is the mark alone where a row has no room for words", () => {
    const { container, unmount } = render(
      <ProfileChip profileId="claude-code:fable:native" variant="mark" />,
    );
    expect(container.textContent).toBe("C");
    expect(find(container, "[role='img']").getAttribute("aria-label")).toBe("claude-code");
    unmount();
  });
});
