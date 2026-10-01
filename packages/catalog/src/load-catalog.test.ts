import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bundledCatalogPath, loadCatalog } from "./load-catalog.js";
import { testVendorOf } from "./test-vendors.js";

const FIXTURES = fileURLToPath(new URL("../../../tests/fixtures/catalog", import.meta.url));

let dir: string;

/** Copies one fixture in as the downloaded file, so each case names the state it is testing. */
async function downloaded(name: string | null): Promise<string> {
  const path = join(dir, "catalog.json");
  await rm(path, { force: true });
  if (name !== null) {
    await copyFile(join(FIXTURES, `${name}.json`), path);
  }
  return path;
}

const bundled = (name: string) => join(FIXTURES, `${name}.json`);

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "agn-catalog-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("loadCatalog", () => {
  it("serves the bundled catalog when nothing was ever downloaded", async () => {
    const loaded = await loadCatalog({
      vendorOf: testVendorOf,
      downloaded: await downloaded(null),
      bundled: bundled("complete"),
    });
    expect(loaded.origin).toBe("bundled");
    expect(loaded.path).toBe(bundled("complete"));
    expect(loaded.problems).toEqual([]);
  });

  it("prefers a downloaded catalog once its version is at least the bundled one's", async () => {
    const loaded = await loadCatalog({
      vendorOf: testVendorOf,
      downloaded: await downloaded("stale"),
      bundled: bundled("complete"),
    });
    expect(loaded.origin).toBe("downloaded");
    expect(loaded.catalog.version).toBe(5);
    expect(loaded.problems).toEqual([]);
  });

  it("ignores an older download without calling it a problem", async () => {
    const loaded = await loadCatalog({
      vendorOf: testVendorOf,
      downloaded: await downloaded("empty"),
      bundled: bundled("complete"),
    });
    expect(loaded.origin).toBe("bundled");
    expect(loaded.catalog.version).toBe(2);
    expect(loaded.problems).toEqual([]);
  });

  it("falls back to the bundle and reports a download that does not parse", async () => {
    for (const [name, code] of [
      ["malformed", "catalog-malformed"],
      ["invalid-row", "catalog-invalid"],
      ["unsupported", "catalog-schema-unsupported"],
    ] as const) {
      const loaded = await loadCatalog({
        vendorOf: testVendorOf,
        downloaded: await downloaded(name),
        bundled: bundled("complete"),
      });
      expect(loaded.origin).toBe("bundled");
      expect(loaded.problems.map((problem) => problem.code)).toEqual([code]);
    }
  });

  it("carries on with an empty catalog when there is nothing readable at all", async () => {
    const loaded = await loadCatalog({
      vendorOf: testVendorOf,
      downloaded: await downloaded(null),
      bundled: join(dir, "not-shipped.json"),
    });
    expect(loaded.origin).toBe("empty");
    expect(loaded.path).toBeNull();
    expect(loaded.catalog.version).toBe(0);
    expect(loaded.catalog.models).toEqual([]);
    expect(loaded.problems.map((problem) => problem.code)).toEqual(["catalog-missing"]);
  });

  it("ships a catalog at the path the loader defaults to", async () => {
    const loaded = await loadCatalog({
      vendorOf: testVendorOf,
      downloaded: join(dir, "none.json"),
    });
    expect(loaded.origin).toBe("bundled");
    expect(loaded.path).toBe(bundledCatalogPath());
    expect(loaded.catalog.models.length).toBeGreaterThan(0);
  });
});
