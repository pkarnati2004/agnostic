// @vitest-environment happy-dom
import type { CatalogSummary } from "@agnostic/core";
import { act } from "react";
import { expect, it, vi } from "vitest";
import { chooseOption, click, openSelect, render } from "../test/render";
import { stubClient } from "../test/workspace-fixture";
import { RecommendationsSection } from "./recommendations-section";

const CHECKED: CatalogSummary = {
  version: 4,
  generatedAt: "2026-09-20T09:00:00.000Z",
  origin: "downloaded",
  lastCheck: {
    checkedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    outcome: "current",
    localVersion: 4,
    remoteVersion: 4,
    message: null,
  },
  checkEnabled: true,
};

async function section(
  over: Partial<Parameters<typeof stubClient>[0]> = {},
  onStaleDays = vi.fn(),
) {
  const client = stubClient({
    catalog: () => Promise.resolve({ catalog: CHECKED }),
    ...over,
  });
  const view = render(
    <RecommendationsSection client={client} staleDays={7} onStaleDays={onStaleDays} />,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return { ...view, onStaleDays };
}

it("says which catalog it serves and how old its last check is", async () => {
  const { container, unmount } = await section();
  expect(container.textContent).toContain("v4 · checked 2d 0h ago");
  unmount();
});

it("says a catalog nobody has checked is unchecked rather than old", async () => {
  const { container, unmount } = await section({
    catalog: () => Promise.resolve({ catalog: { ...CHECKED, lastCheck: null } }),
  });
  expect(container.textContent).toContain("v4 · never checked");
  unmount();
});

it("syncs on request and reports what came back", async () => {
  const updateCatalog = vi.fn(() =>
    Promise.resolve({
      update: {
        outcome: "current" as const,
        localVersion: 4,
        remoteVersion: 4,
        generatedAt: "2026-09-20T09:00:00.000Z",
        remoteSchemaVersion: 1,
        localSchemaVersion: 1,
        benchmarkRows: null,
      },
      catalog: CHECKED,
    }),
  );
  const { container, unmount } = await section({ updateCatalog });
  const button = [...container.querySelectorAll("button")].find((row) =>
    row.textContent?.includes("Sync now"),
  );
  if (button === undefined) {
    throw new Error("no Sync now button");
  }
  click(button);
  await act(async () => {
    await Promise.resolve();
  });
  expect(updateCatalog).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("Already current");
  unmount();
});

it("writes the stale window the user picked", async () => {
  const onStaleDays = vi.fn();
  const { unmount } = await section({}, onStaleDays);
  chooseOption(openSelect("Mark catalog stale after"), "3 days");
  expect(onStaleDays).toHaveBeenCalledWith(3);
  unmount();
});

it("says where the risk review rules live, since they are not set here", async () => {
  const { container, unmount } = await section();
  expect(container.textContent).toContain(
    "Risk review rules are per repo in .ag/preferences.yaml.",
  );
  unmount();
});
