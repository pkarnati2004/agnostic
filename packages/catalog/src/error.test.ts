import { CoreError } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { CatalogError } from "./error.js";

describe("CatalogError", () => {
  it("is a CoreError with its own name, code and hint", () => {
    const error = new CatalogError("catalog is not valid: benchmarks[0].score: too high", {
      code: "catalog-invalid",
      hint: "Delete ~/.agnostic/catalog.json to fall back to the catalog agn ships with.",
    });
    expect(error.name).toBe("CatalogError");
    expect(error.code).toBe("catalog-invalid");
    expect(error.hint).toBe(
      "Delete ~/.agnostic/catalog.json to fall back to the catalog agn ships with.",
    );
    expect(error).toBeInstanceOf(CoreError);
  });
});
