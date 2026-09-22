import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DoctorResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realDetect } from "./app.js";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";
import { fixtureCatalog, fixtureCatalogStore } from "./test-detection.js";

const GROK_BIN = fileURLToPath(new URL("../../../tests/fixtures/bin/grok", import.meta.url));

let daemon: TestDaemon;
let home: string;

/** The one entry `~/.grok/auth.json` needs: the default issuer, a live token, and a tier. */
async function login(tier: string): Promise<void> {
  await mkdir(join(home, ".grok"), { recursive: true });
  await writeFile(
    join(home, ".grok", "auth.json"),
    JSON.stringify({
      "https://auth.x.ai": {
        key: "live-token",
        expires_at: "2099-01-01T00:00:00.000Z",
        subscription_tier: tier,
      },
    }),
  );
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-plan-grok-"));
  await login("SuperGrok Heavy");
  const catalog = fixtureCatalogStore(await fixtureCatalog());
  daemon = await createTestDaemon({
    userHome: home,
    detect: (paths) => realDetect({ PATH: GROK_BIN }, home, paths, catalog)(),
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

const grok = (response: DoctorResponse) => response.harnesses.find((row) => row.harness === "grok");

describe("the daemon reading xAI's tier off the Grok auth file", () => {
  it("reports the detected plan for xai", async () => {
    const report = grok(await doctor());
    expect(report?.login).toBe("logged-in");
    expect(report?.planVendor).toBe("xai");
    expect(report?.plan).toEqual({
      value: "supergrok-heavy",
      source: "detected",
      // The fixture catalog carries no xai plan rows, so the tier is unrecognized but detected.
      known: false,
      confirmed: true,
      overridden: null,
    });
  });

  it("writes plan.changed when the tier in the file changes between two doctor calls", async () => {
    await doctor();
    const before = daemon.ledger.events.latestId();
    await login("Free");
    await doctor();
    const events = daemon.ledger.events.after(before).filter((row) => row.kind === "plan.changed");
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({
      harness: "grok",
      from: "supergrok-heavy",
      to: "free",
      source: "detected",
    });
  });
});
