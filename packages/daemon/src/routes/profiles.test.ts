import { readFile, writeFile } from "node:fs/promises";
import type { DoctorResponse, ProfilesResponse } from "@agnostic/core";
import { afterEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";
import { fixtureDetection } from "../test-detection.js";

let daemon: TestDaemon;

afterEach(() => daemon.close());

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("GET /profiles", () => {
  it("answers from the detection that ran at start", async () => {
    daemon = await createTestDaemon();
    expect(daemon.detectCalls()).toBe(1);
    const response = await daemon.request("/profiles");
    expect(response.status).toBe(200);
    const profiles = await body<ProfilesResponse>(response);
    expect(profiles.profiles.map((profile) => profile.model)).toEqual([null, "sonnet-4.5"]);
    expect(profiles.detectedAt).toBeTruthy();
    expect(daemon.detectCalls()).toBe(1);
  });

  it("appends one profile.detected per available profile on the first run", async () => {
    daemon = await createTestDaemon();
    const kinds = daemon.ledger.events.after(0).map((event) => event.kind);
    expect(kinds).toEqual(["profile.detected", "profile.detected"]);
  });
});

describe("POST /doctor", () => {
  it("detects again and returns harnesses, profiles, detectedAt and the PATH", async () => {
    daemon = await createTestDaemon();
    const response = await daemon.request("/doctor", { method: "POST" });
    expect(response.status).toBe(200);
    const doctor = await body<DoctorResponse>(response);
    expect(daemon.detectCalls()).toBe(2);
    expect(doctor.harnesses).toHaveLength(1);
    expect(doctor.harnesses[0]).toMatchObject({
      harness: "claude-code",
      models: ["sonnet-4.5"],
      modelSource: "probe",
    });
    expect(doctor.pathVar).toBe("/opt/bin");
  });

  it("says nothing new when the second run finds the same profiles", async () => {
    daemon = await createTestDaemon();
    const before = daemon.ledger.events.latestId();
    await daemon.request("/doctor", { method: "POST" });
    expect(daemon.ledger.events.after(before)).toEqual([]);
  });

  it("announces exactly one profile when a probe reveals one new model", async () => {
    let run = 0;
    daemon = await createTestDaemon({
      detect: () => {
        run += 1;
        return Promise.resolve(
          fixtureDetection(run === 1 ? ["sonnet-4.5"] : ["sonnet-4.5", "opus-4.1"]),
        );
      },
    });
    const before = daemon.ledger.events.latestId();
    await daemon.request("/doctor", { method: "POST" });
    const added = daemon.ledger.events.after(before);
    expect(added).toHaveLength(1);
    expect(added[0]?.kind).toBe("profile.detected");

    const profiles = await body<ProfilesResponse>(await daemon.request("/profiles"));
    expect(profiles.profiles.map((profile) => profile.model)).toEqual([
      null,
      "sonnet-4.5",
      "opus-4.1",
    ]);
  });
});

describe("POST /doctor with a plan", () => {
  it("writes the plan into config.yaml, keeps the port, and reports it back", async () => {
    daemon = await createTestDaemon();
    await writeFile(daemon.paths.config, "port: 7500\n");
    const response = await daemon.request("/doctor", {
      method: "POST",
      body: JSON.stringify({ plans: { claude: "max20" } }),
    });
    expect(response.status).toBe(200);
    expect(await body<DoctorResponse>(response)).toMatchObject({ plans: { claude: "max20" } });
    const config = await readFile(daemon.paths.config, "utf8");
    expect(config).toContain("claude: max20");
    expect(config).toContain("port: 7500");
  });

  it("takes a plan the catalog has never heard of", async () => {
    daemon = await createTestDaemon();
    const response = await daemon.request("/doctor", {
      method: "POST",
      body: JSON.stringify({ plans: { chatgpt: "go" } }),
    });
    expect(response.status).toBe(200);
    expect((await body<DoctorResponse>(response)).plans).toEqual({ chatgpt: "go" });
  });

  it("refuses a vendor it does not bill for", async () => {
    daemon = await createTestDaemon();
    const response = await daemon.request("/doctor", {
      method: "POST",
      body: JSON.stringify({ plans: { codex: "plus" } }),
    });
    expect(response.status).toBe(400);
    expect(await body<{ error: { code: string } }>(response)).toMatchObject({
      error: { code: "request-invalid" },
    });
  });

  it("offers the plans the catalog knows, and nothing else", async () => {
    daemon = await createTestDaemon();
    const doctor = await body<DoctorResponse>(await daemon.request("/doctor", { method: "POST" }));
    expect(doctor.planOptions).toEqual([
      { vendor: "claude", id: "pro", displayName: "Pro" },
      { vendor: "claude", id: "max5", displayName: "Max 5x" },
      { vendor: "claude", id: "max20", displayName: "Max 20x" },
      { vendor: "chatgpt", id: "plus", displayName: "Plus" },
    ]);
  });
});
