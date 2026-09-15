import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DoctorResponse, Profile } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realDetect } from "./app.js";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";
import { fixtureCatalog, fixtureCatalogStore } from "./test-detection.js";

const FIXTURES = fileURLToPath(new URL("../../../tests/fixtures", import.meta.url));

let daemon: TestDaemon;
let home: string;

/** Codex's own auth file, with the plan claim its CLI writes into the id token. */
async function login(plan: string): Promise<void> {
  const payload = {
    "https://api.openai.com/auth": { chatgpt_plan_type: plan },
  };
  const token = `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
  await mkdir(join(home, ".codex"), { recursive: true });
  await writeFile(
    join(home, ".codex", "auth.json"),
    JSON.stringify({ auth_mode: "chatgpt", tokens: { id_token: token } }),
  );
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-plan-"));
  await login("plus");
  const catalog = fixtureCatalogStore(await fixtureCatalog());
  daemon = await createTestDaemon({
    userHome: home,
    detect: (paths) => realDetect({ PATH: join(FIXTURES, "bin", "tier1") }, home, paths, catalog)(),
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

const codexProfiles = (profiles: Profile[]) =>
  profiles.filter((profile) => profile.harness === "codex" && profile.route === "native");

describe("the daemon reading a plan off disk", () => {
  it("reports the detected plan and bills the catalog's way", async () => {
    const report = (await doctor()).harnesses.find((row) => row.harness === "codex");
    expect(report?.plan).toEqual({
      value: "plus",
      source: "detected",
      known: true,
      confirmed: true,
    });
    expect(codexProfiles((await doctor()).profiles).map((row) => [row.model, row.billing])).toEqual(
      [
        [null, "subscription"],
        // The fixture catalog meters this model on plus, so it is credits and not subscription.
        ["gpt-6-astra", "credits"],
        // No entitlement row for it, which reads as included.
        ["gpt-6-mini", "subscription"],
      ],
    );
  });

  it("writes plan.changed and re-bills when the user changes plan", async () => {
    await doctor();
    const before = daemon.ledger.events.latestId();
    await login("team");
    const after = await doctor();
    const events = daemon.ledger.events.after(before).filter((row) => row.kind === "plan.changed");
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({
      harness: "codex",
      from: "plus",
      to: "business",
      source: "detected",
    });
    // business is not in the fixture catalog, so agn says so instead of billing as if it knew.
    expect(after.harnesses.find((row) => row.harness === "codex")?.plan).toEqual({
      value: "business",
      source: "detected",
      known: false,
      confirmed: true,
    });
    for (const profile of codexProfiles(after.profiles)) {
      expect(profile.billing).toBe("unknown");
      expect(profile.evidence).toBe("unknown-plan");
    }
  });

  it("looks again on its own when the auth file changes under it", async () => {
    await doctor();
    const calls = daemon.detectCalls();
    await login("pro");
    const profiles = (await daemon.request("/profiles")).json() as Promise<{
      profiles: Profile[];
    }>;
    await profiles;
    expect(daemon.detectCalls()).toBe(calls + 1);
  });

  it("falls back to config.yaml for a harness whose files say nothing", async () => {
    await writeFile(daemon.paths.config, "plans:\n  claude: max20\n");
    const report = (await doctor()).harnesses.find((row) => row.harness === "claude-code");
    expect(report?.plan).toEqual({
      value: "max20",
      source: "config",
      known: true,
      confirmed: true,
    });
  });

  it("doubts a configured plan whose models say otherwise", async () => {
    // The fixture catalog says Opus cannot run on Pro, and Claude Code lists it, so the plan on
    // file is out of date and doctor has to ask rather than bill from it.
    await writeFile(daemon.paths.config, "plans:\n  claude: pro\n");
    const report = (await doctor()).harnesses.find((row) => row.harness === "claude-code");
    expect(report?.plan).toEqual({
      value: "pro",
      source: "config",
      known: true,
      confirmed: false,
    });
  });
});
