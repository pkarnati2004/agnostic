import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  defaultPreferences,
  PreferencesSchema,
  readPreferences,
  writePreferences,
} from "./preferences.js";

const FIXTURES = fileURLToPath(new URL("../../../tests/fixtures/ag", import.meta.url));

describe("readPreferences", () => {
  it("reads the file, and a custom rule list replaces the defaults", async () => {
    expect(await readPreferences(`${FIXTURES}/complete`)).toEqual({
      optimize: "quality",
      subscriptionsOnly: true,
      allowLocal: false,
      riskRules: [
        {
          area: "auth",
          keywords: ["auth", "oauth", "session"],
          review: "independent",
          minEvidence: "strong",
        },
      ],
    });
  });

  it("falls back to the defaults when the file is missing or empty", async () => {
    for (const repo of ["none", "minimal", "empty-files"]) {
      expect(await readPreferences(`${FIXTURES}/${repo}`)).toEqual(defaultPreferences());
    }
  });

  it("names the key that failed the schema rather than defaulting over it", async () => {
    await expect(readPreferences(`${FIXTURES}/invalid`)).rejects.toMatchObject({
      code: "ag-file-invalid",
      message: expect.stringContaining("optimize"),
      file: expect.stringContaining("/.ag/preferences.yaml"),
      hint: expect.stringContaining("delete it to use the defaults"),
    });
  });

  it("rejects a file that is not yaml", async () => {
    await expect(readPreferences(`${FIXTURES}/malformed`)).rejects.toMatchObject({
      code: "ag-file-malformed",
      file: expect.stringContaining("/.ag/preferences.yaml"),
      hint: expect.stringContaining("delete it to use the defaults"),
    });
  });
});

describe("PreferencesSchema", () => {
  it("rejects an evidence level that does not exist", () => {
    const risk_rules = [
      { area: "auth", keywords: ["auth"], review: "independent", min_evidence: "huge" },
    ];
    expect(PreferencesSchema.safeParse({ risk_rules }).success).toBe(false);
  });

  it("rejects a string where a boolean belongs", () => {
    expect(PreferencesSchema.safeParse({ subscriptions_only: "yes" }).success).toBe(false);
  });

  it("rejects a key nobody reads", () => {
    expect(PreferencesSchema.safeParse({ optimise: "quality" }).success).toBe(false);
  });
});

describe("defaultPreferences", () => {
  it("names the four areas that get an independent review", () => {
    expect(defaultPreferences().riskRules.map((rule) => rule.area)).toEqual([
      "auth",
      "db",
      "payments",
      "infra",
    ]);
  });
});

describe("writePreferences", () => {
  it("writes the header comment and round-trips the defaults", async () => {
    const repo = await mkdtemp(join(tmpdir(), "agnostic-preferences-"));
    await writePreferences(repo, defaultPreferences());
    const text = await readFile(join(repo, ".ag", "preferences.yaml"), "utf8");
    expect(text.split("\n")[0]).toBe("# optimize: quality | balanced | cost | speed");
    expect(await readPreferences(repo)).toEqual(defaultPreferences());
  });

  it("creates .ag/ when it does not exist yet", async () => {
    const repo = await mkdtemp(join(tmpdir(), "agnostic-preferences-"));
    await writePreferences(repo, defaultPreferences());
    await expect(readFile(join(repo, ".ag", "preferences.yaml"), "utf8")).resolves.toBeTruthy();
  });

  it("writes the four built-in risk rules so they are visible and editable on disk", async () => {
    const repo = await mkdtemp(join(tmpdir(), "agnostic-preferences-"));
    await writePreferences(repo, defaultPreferences());
    const text = await readFile(join(repo, ".ag", "preferences.yaml"), "utf8");
    for (const area of ["auth", "db", "payments", "infra"]) {
      expect(text).toContain(`area: ${area}`);
    }
  });
});
