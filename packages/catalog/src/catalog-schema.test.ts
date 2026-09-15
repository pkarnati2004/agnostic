import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { CoreError } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { parseCatalog } from "./catalog-schema.js";

const FIXTURES = fileURLToPath(new URL("../../../tests/fixtures/catalog", import.meta.url));

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(`${FIXTURES}/${name}.json`, "utf8"));
}

function failure(raw: unknown): CoreError {
  try {
    parseCatalog(raw);
  } catch (cause) {
    return cause as CoreError;
  }
  throw new Error("expected parseCatalog to refuse this catalog");
}

describe("parseCatalog", () => {
  it("reads a complete catalog and an empty one", async () => {
    const complete = parseCatalog(await fixture("complete"));
    expect(complete.version).toBe(2);
    expect(complete.models).toHaveLength(6);
    expect(complete.plans.map((plan) => plan.id)).toEqual(["pro", "max5", "max20", "plus"]);
    const empty = parseCatalog(await fixture("empty"));
    expect(empty.benchmarks).toEqual([]);
    expect(empty.entitlements).toEqual([]);
  });

  it("names the table, the row and the field of a value out of range", async () => {
    const error = failure(await fixture("invalid-row"));
    expect(error.code).toBe("catalog-invalid");
    expect(error.message).toContain("benchmarks[0].score");
  });

  it("tells a newer schema apart from a broken file, and says to update", async () => {
    const error = failure(await fixture("unsupported"));
    expect(error.code).toBe("catalog-schema-unsupported");
    expect(error.hint).toContain("Update agn");
  });

  it("refuses a key it does not know", async () => {
    const catalog = (await fixture("complete")) as Record<string, unknown>;
    expect(failure({ ...catalog, weights: [] }).code).toBe("catalog-invalid");
  });

  it("refuses an entitlement row whose vendor is not its harness's", async () => {
    const catalog = parseCatalog(await fixture("complete"));
    const wrongVendor = {
      ...catalog,
      entitlements: [
        {
          harness: "codex",
          model: "gpt-6-astra",
          vendor: "claude",
          plan: "max20",
          access: "included",
        },
      ],
    };
    const error = failure(wrongVendor);
    expect(error.code).toBe("catalog-invalid");
    expect(error.message).toContain("entitlements[0].vendor");
    // A harness with no plan at all cannot be entitled to one either.
    const noPlan = {
      ...catalog,
      entitlements: [
        {
          harness: "pi",
          model: "moonshotai/kimi-k2.6",
          vendor: "claude",
          plan: "pro",
          access: "included",
        },
      ],
    };
    expect(failure(noPlan).message).toContain("entitlements[0].vendor");
  });

  it("refuses a row that points at a plan or a source no table has", async () => {
    const catalog = parseCatalog(await fixture("complete"));
    const orphan = {
      ...catalog,
      entitlements: [
        {
          harness: "codex",
          model: "gpt-6-astra",
          vendor: "chatgpt",
          plan: "max20",
          access: "included",
        },
      ],
    };
    expect(failure(orphan).message).toContain("entitlements[0].plan");
    const unsourced = {
      ...catalog,
      benchmarks: [{ ...catalog.benchmarks[0], source: "nowhere" }],
    };
    expect(failure(unsourced).message).toContain("benchmarks[0].source");
  });
});
