import {
  type CatalogRowsResponse,
  type CatalogShowRow,
  type CatalogSummary,
  type CatalogUpdate,
  DaemonApiError,
} from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { createTestContext } from "../test-context.js";
import { catalogCommand } from "./catalog.js";

const PROFILE = "claude-code:opus:native";

const SUMMARY: CatalogSummary = {
  version: 14,
  generatedAt: "2026-09-08T00:00:00Z",
  origin: "downloaded",
  lastCheck: {
    checkedAt: "2026-09-12T09:00:00.000Z",
    outcome: "current",
    localVersion: 14,
    remoteVersion: 14,
    message: null,
  },
  checkEnabled: true,
};

function row(over: Partial<CatalogShowRow> = {}): CatalogShowRow {
  return {
    source: "terminal-bench",
    date: "2026-08-31",
    benchmark: "Terminal-Bench 4.0",
    model: "anthropic/claude-opus-5",
    harness: "claude-code",
    taskClass: "implement",
    metric: "accuracy",
    score: 57.4,
    weight: 1,
    cited: true,
    ...over,
  };
}

function cli(over: {
  rows?: Partial<CatalogRowsResponse>;
  update?: Partial<CatalogUpdate>;
  fail?: DaemonApiError;
}) {
  return createTestContext({
    client: {
      catalogRows: (profile) =>
        Promise.resolve({
          catalog: SUMMARY,
          profileId: profile,
          rows: [row()],
          cited: null,
          ...over.rows,
        }),
      catalogUpdate: () =>
        over.fail === undefined
          ? Promise.resolve({
              catalog: SUMMARY,
              update: {
                outcome: "current",
                localVersion: 14,
                remoteVersion: 14,
                generatedAt: "2026-09-08T00:00:00Z",
                remoteSchemaVersion: 1,
                localSchemaVersion: 1,
                benchmarkRows: null,
                ...over.update,
              },
            })
          : Promise.reject(over.fail),
    },
  });
}

async function show(test: ReturnType<typeof cli>, args: string[] = [PROFILE]): Promise<void> {
  await catalogCommand(test.ctx).parseAsync(["show", ...args], { from: "user" });
}

async function update(test: ReturnType<typeof cli>): Promise<void> {
  await catalogCommand(test.ctx).parseAsync(["update"], { from: "user" });
}

describe("agn catalog show", () => {
  it("prints the catalog it is showing, then the rows", async () => {
    const test = cli({});
    await show(test);
    expect(test.out[0]).toBe(
      "catalog 14 (downloaded, generated 2026-09-08; checked 2026-09-12T09:00:00.000Z; daily check on)",
    );
    expect(test.out[1]?.split(/\s+/)).toEqual([
      "source",
      "benchmark",
      "class",
      "harness",
      "metric",
      "score",
      "date",
      "weight",
    ]);
    expect(test.out[2]).toContain("terminal-bench");
    expect(test.out[2]).toContain("1.00");
    expect(test.out).toHaveLength(3);
  });

  it("says when the catalog was never checked and when the daily check is off", async () => {
    const test = cli({ rows: { catalog: { ...SUMMARY, lastCheck: null, checkEnabled: false } } });
    await show(test);
    expect(test.out[0]).toContain("never checked; daily check off");
  });

  it("marks the rows the last recommendation cited and says so at the end", async () => {
    const test = cli({
      rows: {
        rows: [row(), row({ source: "livebench", harness: null, cited: false })],
        cited: { evidence: "strong", sources: ["terminal-bench"] },
      },
    });
    await show(test);
    expect(test.out[2]?.endsWith("*")).toBe(true);
    expect(test.out[3]?.endsWith("*")).toBe(false);
    // A row that measured the model alone names no harness.
    expect(test.out[3]).toContain("-");
    expect(test.out[4]).toBe("* cited by the last recommendation (strong evidence)");
  });

  it("says so when the catalog has nothing for the profile", async () => {
    const test = cli({ rows: { rows: [] } });
    await show(test);
    expect(test.out[1]).toBe(`no rows for ${PROFILE}`);
  });

  it("prints the response as it came with --json", async () => {
    const test = cli({});
    test.ctx.json = true;
    await show(test);
    expect(JSON.parse(test.out.join("\n"))).toMatchObject({ profileId: PROFILE });
  });
});

describe("agn catalog update", () => {
  it("says what changed", async () => {
    const test = cli({
      update: { outcome: "updated", localVersion: 12, remoteVersion: 14, benchmarkRows: 212 },
    });
    await update(test);
    expect(test.out).toEqual([
      "catalog updated 12 → 14 (generated 2026-09-08, 212 benchmark rows)",
    ]);
    expect(test.ctx.exitCode).toBe(0);
  });

  it("says when there was nothing to change", async () => {
    const test = cli({});
    await update(test);
    expect(test.out).toEqual(["catalog 14 is current (generated 2026-09-08)"]);
  });

  it("asks for a newer agn when the published catalog needs one, and fails", async () => {
    const test = cli({
      update: { outcome: "unsupported", remoteVersion: 16, remoteSchemaVersion: 2 },
    });
    await update(test);
    expect(test.out).toEqual([]);
    expect(test.err).toEqual([
      "catalog 16 needs a newer agn: it uses schema 2 and this agn reads schema 1",
      "  hint: npm i -g agnostic-dev@latest",
    ]);
    expect(test.ctx.exitCode).toBe(1);
  });

  it("passes a failed fetch on with the hint that the catalog on disk stays in use", async () => {
    const fail = new DaemonApiError("could not fetch https://catalog/manifest.json: HTTP 503", {
      code: "catalog-fetch-failed",
      hint: "The catalog on disk (14) stays in use.",
      status: 502,
    });
    const error = await update(cli({ fail })).catch((cause: unknown) => cause);
    expect(error).toBe(fail);
  });
});
