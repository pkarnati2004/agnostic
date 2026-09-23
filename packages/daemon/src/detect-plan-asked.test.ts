import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DoctorResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realDetect } from "./app.js";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";
import { fixtureCatalog, fixtureCatalogStore } from "./test-detection.js";

const GEMINI_BIN = fileURLToPath(new URL("../../../tests/fixtures/bin/gemini", import.meta.url));

let daemon: TestDaemon;
let home: string;

/** The OAuth triple Gemini CLI writes when the user signs in with a Google account. */
async function login(): Promise<void> {
  await mkdir(join(home, ".gemini"), { recursive: true });
  await writeFile(
    join(home, ".gemini", "oauth_creds.json"),
    JSON.stringify({
      access_token: "ya29.access",
      refresh_token: "1//refresh",
      expiry_date: 4102444800000,
    }),
  );
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-plan-asked-"));
  await login();
  const catalog = await fixtureCatalog();
  const store = fixtureCatalogStore({
    ...catalog,
    plans: [
      ...catalog.plans,
      { vendor: "google", id: "ai-pro", displayName: "Google AI Pro", confirmedAt: "2026-09-21" },
    ],
  });
  daemon = await createTestDaemon({
    userHome: home,
    detect: (paths) => realDetect({ PATH: GEMINI_BIN }, home, paths, store)(),
  });
});

afterEach(async () => {
  await daemon.close();
  await rm(home, { recursive: true, force: true });
});

async function doctor(): Promise<DoctorResponse> {
  const response = await daemon.request("/doctor", { method: "POST" });
  return (await response.json()) as DoctorResponse;
}

const gemini = (response: DoctorResponse) =>
  response.harnesses.find((row) => row.harness === "gemini");

describe("the daemon reading a login whose file names no plan", () => {
  it("reports the Google login and leaves the plan for doctor to ask about", async () => {
    const report = gemini(await doctor());
    expect(report?.login).toBe("logged-in");
    expect(report?.billing).toBe("subscription");
    expect(report?.planVendor).toBe("google");
    expect(report?.plan).toBeNull();
  });

  it("takes the answer from config.yaml and bills the catalog's way", async () => {
    await writeFile(daemon.paths.config, "plans:\n  google: ai-pro\n");
    expect(gemini(await doctor())?.plan).toEqual({
      value: "ai-pro",
      source: "config",
      known: true,
      confirmed: true,
    });
    const profiles = (await doctor()).profiles.filter((row) => row.harness === "gemini");
    expect(profiles.map((row) => [row.billing, row.evidence])).toEqual([
      ["subscription", "binary"],
    ]);
  });
});
