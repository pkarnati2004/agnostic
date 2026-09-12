import { fileURLToPath } from "node:url";
import { type Catalog, readCatalogFile } from "@agnostic/catalog";
import type { Event, EvidenceLevel } from "@agnostic/core";
import { beforeAll, describe, expect, it } from "vitest";
import { catalogRowsFor } from "./catalog-rows.js";

const PROFILE = "claude-code:opus:native";
const NOW = new Date("2026-09-12T00:00:00.000Z");
const LATER = new Date("2028-09-12T00:00:00.000Z");

let catalog: Catalog;

beforeAll(async () => {
  const file = fileURLToPath(
    new URL("../../../tests/fixtures/catalog/remote/catalog.json", import.meta.url),
  );
  const loaded = await readCatalogFile(file);
  if (loaded === null) {
    throw new Error(`the remote catalog fixture is missing: ${file}`);
  }
  catalog = loaded;
});

function recommendation(opts: {
  profileId?: string;
  evidence: EvidenceLevel;
  sources: string[];
}): Event<"recommendation.made"> {
  const profileId = opts.profileId ?? PROFILE;
  return {
    id: 7,
    ts: "2026-09-12T08:00:00.000Z",
    kind: "recommendation.made",
    payload: {
      recommendation: {
        recommended: {
          profileId,
          reason: "it leads on the rows that name this harness",
          evidence: opts.evidence,
          sources: opts.sources,
        },
        alternative: null,
        worthTrying: null,
        riskNote: null,
      },
      chosenProfileId: profileId,
    },
  };
}

function rowsFor(profileId: string, recommended: Event<"recommendation.made"> | null = null) {
  return catalogRowsFor({ catalog, profileId, now: NOW, recommendation: recommended });
}

describe("catalogRowsFor", () => {
  it("puts the rows that name the harness before the bare-model rows", () => {
    const { rows } = rowsFor(PROFILE);
    expect(rows.map((row) => [row.source, row.harness])).toEqual([
      ["terminal-bench", "claude-code"],
      ["livebench", null],
    ]);
    // The profile's model resolves to its canonical id before the rows are looked up.
    expect(rows.every((row) => row.model === "anthropic/claude-opus-5")).toBe(true);
    expect(rows[0]?.weight).toBe(1);
  });

  it("has nothing for a model the catalog does not name", () => {
    expect(rowsFor("claude-code:no-such-model:native").rows).toEqual([]);
  });

  it("falls back to the raw model id when the catalog has no models row for it", () => {
    // "sonnet-4.5" is not in `models[]`, but a benchmark keyed by that raw name still matches.
    const withUnmapped: Catalog = {
      ...catalog,
      models: catalog.models.filter((row) => row.harness !== "claude-code" || row.model !== "opus"),
      benchmarks: [
        {
          source: "terminal-bench",
          date: "2026-08-30",
          benchmark: "Terminal-Bench 4.0",
          model: "sonnet-4.5",
          modelVersion: null,
          harness: "claude-code",
          harnessVersion: null,
          taskClass: "general",
          metric: "accuracy",
          score: 50,
          n: null,
          costUsd: null,
          tokens: null,
          notes: "",
        },
      ],
    };
    const { rows } = catalogRowsFor({
      catalog: withUnmapped,
      profileId: "claude-code:sonnet-4.5:native",
      now: NOW,
      recommendation: null,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.model).toBe("sonnet-4.5");
  });

  it("has nothing for a profile that names no model", () => {
    expect(rowsFor("claude-code:default:native").rows).toEqual([]);
  });

  it("drops rows that have aged out", () => {
    expect(
      catalogRowsFor({ catalog, profileId: PROFILE, now: LATER, recommendation: null }).rows,
    ).toEqual([]);
  });

  it("refuses something that is not a profile id", () => {
    expect(() => rowsFor("claude-code")).toThrowError(
      expect.objectContaining({ code: "invalid-profile-id" }),
    );
  });
});

describe("catalogRowsFor marks what the last recommendation cited", () => {
  it("marks the harness rows of the cited sources at strong and at some", () => {
    for (const evidence of ["strong", "some"] as const) {
      const { rows, cited } = rowsFor(
        PROFILE,
        recommendation({ evidence, sources: ["terminal-bench", "livebench"] }),
      );
      expect(cited).toEqual({ evidence, sources: ["terminal-bench", "livebench"] });
      expect(rows.filter((row) => row.cited).map((row) => row.source)).toEqual(["terminal-bench"]);
    }
  });

  it("marks the bare-model row when that is all the evidence there was", () => {
    const { rows } = rowsFor(
      PROFILE,
      recommendation({ evidence: "model-level", sources: ["terminal-bench", "livebench"] }),
    );
    expect(rows.filter((row) => row.cited).map((row) => row.source)).toEqual(["livebench"]);
  });

  it("marks nothing when the recommendation rested on no evidence", () => {
    const { rows } = rowsFor(PROFILE, recommendation({ evidence: "none", sources: [] }));
    expect(rows.some((row) => row.cited)).toBe(false);
  });

  it("marks nothing for a source the recommendation did not name", () => {
    const { rows } = rowsFor(PROFILE, recommendation({ evidence: "strong", sources: ["nowhere"] }));
    expect(rows.some((row) => row.cited)).toBe(false);
  });

  it("says nothing was cited when the last recommendation picked another profile", () => {
    const other = recommendation({
      profileId: "codex:gpt-6-astra:native",
      evidence: "strong",
      sources: ["terminal-bench"],
    });
    const { rows, cited } = rowsFor(PROFILE, other);
    expect(cited).toBeNull();
    expect(rows.some((row) => row.cited)).toBe(false);
  });

  it("says nothing was cited when no recommendation has been made", () => {
    expect(rowsFor(PROFILE).cited).toBeNull();
  });
});
