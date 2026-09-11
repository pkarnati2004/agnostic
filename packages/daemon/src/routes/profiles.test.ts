import type { DoctorResponse, ProfilesResponse } from "@agnostic/core";
import { afterEach, describe, expect, it } from "vitest";
import { createTestDaemon, fixtureDetection, type TestDaemon } from "../test-daemon.js";

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
