// @vitest-environment happy-dom
import type { CatalogCheckState, CatalogSummary, CatalogUpdateResponse } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/error";
import { click, find, render } from "../test/render";
import { stubClient } from "../test/workspace-fixture";
import { CatalogNotice } from "./catalog-notice";

const NOW = Date.parse("2026-09-24T10:00:00.000Z");

const CHECK: CatalogCheckState = {
  checkedAt: "2026-09-15T09:00:00.000Z",
  outcome: "current",
  localVersion: 2,
  remoteVersion: 2,
  message: null,
};

const STALE: CatalogSummary = {
  version: 2,
  generatedAt: "2026-09-08T00:00:00.000Z",
  origin: "downloaded",
  lastCheck: CHECK,
  checkEnabled: true,
};

const FRESH: CatalogSummary = {
  ...STALE,
  lastCheck: { ...CHECK, checkedAt: "2026-09-23T09:00:00.000Z" },
};

const UPDATED: CatalogUpdateResponse = {
  update: {
    outcome: "updated",
    localVersion: 2,
    remoteVersion: 3,
    generatedAt: "2026-09-24T00:00:00.000Z",
    remoteSchemaVersion: 1,
    localSchemaVersion: 1,
    benchmarkRows: 40,
  },
  catalog: { ...FRESH, version: 3, lastCheck: { ...CHECK, checkedAt: "2026-09-24T10:00:00.000Z" } },
};

async function notice(client: ReturnType<typeof stubClient>) {
  const view = render(<CatalogNotice client={client} now={NOW} />);
  await act(async () => undefined);
  return view;
}

describe("CatalogNotice", () => {
  it("says how old the catalog is, and what to run", async () => {
    const { container, unmount } = await notice(
      stubClient({ catalog: () => Promise.resolve({ catalog: STALE }) }),
    );
    expect(container.textContent).toContain("Catalog last checked 9 days ago.");
    expect(find(container, "code").textContent).toBe("agn catalog update");
    unmount();
  });

  it("updates the catalog and reads the new summary back", async () => {
    const updateCatalog = vi.fn(() => Promise.resolve(UPDATED));
    const { container, unmount } = await notice(
      stubClient({ catalog: () => Promise.resolve({ catalog: STALE }), updateCatalog }),
    );
    click(find(container, "button"));
    await act(async () => undefined);
    expect(updateCatalog).toHaveBeenCalledOnce();
    expect(container.textContent).toBe("");
    unmount();
  });

  it("says what the daemon refused with when the update fails", async () => {
    const refusal = new ApiError("the catalog host did not answer", {
      code: "catalog-fetch-failed",
      hint: "Try again, or run `agn catalog update`.",
      status: 502,
    });
    const { container, unmount } = await notice(
      stubClient({
        catalog: () => Promise.resolve({ catalog: STALE }),
        updateCatalog: () => Promise.reject(refusal),
      }),
    );
    click(find(container, "button"));
    await act(async () => undefined);
    expect(container.textContent).toContain("the catalog host did not answer");
    expect(container.textContent).toContain("Try again");
    unmount();
  });

  it("says nothing about a catalog checked this week", async () => {
    const { container, unmount } = await notice(
      stubClient({ catalog: () => Promise.resolve({ catalog: FRESH }) }),
    );
    expect(container.textContent).toBe("");
    unmount();
  });

  // The catalog's age is not worth a second failure on the page.
  it("says nothing when the read itself fails", async () => {
    const { container, unmount } = await notice(
      stubClient({ catalog: () => Promise.reject(new Error("nope")) }),
    );
    expect(container.textContent).toBe("");
    unmount();
  });
});
