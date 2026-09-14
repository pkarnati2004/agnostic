import { describe, expect, it } from "vitest";
import { CATALOG_BASE_URL, catalogSource } from "./catalog-source.js";
import { CatalogError } from "./error.js";

function refuses(base: string): CatalogError {
  const caught = (() => {
    try {
      catalogSource({ AGNOSTIC_CATALOG_URL: base });
    } catch (cause: unknown) {
      return cause;
    }
    return null;
  })();
  expect(caught).toBeInstanceOf(CatalogError);
  return caught as CatalogError;
}

describe("catalogSource", () => {
  it("reads the published catalog when nothing overrides it", () => {
    expect(catalogSource({})).toEqual({
      manifestUrl: `${CATALOG_BASE_URL}/manifest.json`,
      fileUrl: `${CATALOG_BASE_URL}/catalog.json`,
    });
  });

  it("puts both files under the base it is given, trailing slash or not", () => {
    expect(catalogSource({ AGNOSTIC_CATALOG_URL: "http://127.0.0.1:1/x/" })).toEqual({
      manifestUrl: "http://127.0.0.1:1/x/manifest.json",
      fileUrl: "http://127.0.0.1:1/x/catalog.json",
    });
  });

  it("refuses a base agn cannot fetch over, before anything is fetched", () => {
    for (const base of ["file:///tmp/catalog", "ftp://mirror.test/catalog"]) {
      const error = refuses(base);
      expect(error.code).toBe("catalog-url-invalid");
      expect(error.message).toContain("AGNOSTIC_CATALOG_URL");
    }
  });

  it("refuses a bare path and an empty value rather than guessing a scheme", () => {
    expect(refuses("/tmp/catalog").code).toBe("catalog-url-invalid");
    expect(refuses("").message).toContain("that is not a URL");
  });
});
