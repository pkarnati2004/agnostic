import { readFile, writeFile } from "node:fs/promises";
import type { DoctorResponse, ProfilesResponse } from "@agnostic/core";
import { apiKeyVars } from "@agnostic/registry";
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
    // Doctor prints support, not tier: hooks and a transcript reader are what the user gets.
    expect(doctor.harnesses[0]?.support).toBe("full");
    expect(doctor.named).toEqual([]);
  });

  it("says which key variables are set, and never carries one's value", async () => {
    daemon = await createTestDaemon({ env: { OPENROUTER_API_KEY: "or-secret" } });
    const response = await daemon.request("/doctor", { method: "POST" });
    const doctor = await body<DoctorResponse>(response);
    expect(doctor.keys).toContainEqual({
      name: "OPENROUTER_API_KEY",
      set: true,
      usedBy: ["pi", "opencode"],
    });
    expect(doctor.keys).toContainEqual({
      name: "GEMINI_API_KEY",
      set: false,
      usedBy: ["gemini"],
    });
    expect(JSON.stringify(doctor)).not.toContain("or-secret");
  });

  it("never carries the value of a set variable, under a sentinel only this test's env has", async () => {
    const sentinel = "agn-test-sentinel-9f3a1c";
    daemon = await createTestDaemon({ env: { ANTHROPIC_API_KEY: sentinel } });
    const response = await daemon.request("/doctor", { method: "POST" });
    const text = await response.clone().text();
    const doctor = await body<DoctorResponse>(response);
    const row = doctor.keys.find((key) => key.name === "ANTHROPIC_API_KEY");
    expect(row?.set).toBe(true);
    expect(text).not.toContain(sentinel);
    expect(JSON.stringify(doctor)).not.toContain(sentinel);
  });

  it("answers set as a boolean, with one row per registry variable and nothing else", async () => {
    daemon = await createTestDaemon({ env: { OPENROUTER_API_KEY: "or-secret" } });
    const doctor = await body<DoctorResponse>(await daemon.request("/doctor", { method: "POST" }));
    for (const key of doctor.keys) {
      expect(typeof key.set).toBe("boolean");
    }
    expect(doctor.keys.map((key) => key.name)).toEqual(apiKeyVars().map((row) => row.name));
  });

  it("reports the tmux this machine has, for the row that says reattach needs 3.3", async () => {
    daemon = await createTestDaemon();
    const doctor = await body<DoctorResponse>(await daemon.request("/doctor", { method: "POST" }));
    expect(doctor.tmux).toEqual({ version: "3.4", ok: true });
  });

  it("labels Grok and Copilot full: each installs a hook and agn reads its tokens", async () => {
    daemon = await createTestDaemon({
      detect: () => Promise.resolve(fixtureDetection([], ["grok", "copilot"])),
    });
    const doctor = await body<DoctorResponse>(await daemon.request("/doctor", { method: "POST" }));
    expect(doctor.harnesses.map((row) => [row.harness, row.support, row.usageSource])).toEqual([
      ["grok", "full", "transcripts"],
      ["copilot", "full", "transcripts"],
    ]);
  });

  it("labels a hooked agent agn counts nothing for status, and says so per agent", async () => {
    daemon = await createTestDaemon({
      detect: () => Promise.resolve(fixtureDetection([], ["kimi"])),
    });
    const doctor = await body<DoctorResponse>(await daemon.request("/doctor", { method: "POST" }));
    expect(doctor.harnesses.map((row) => [row.harness, row.support, row.usageSource])).toEqual([
      ["kimi", "status", null],
    ]);
  });

  it("names the harnesses config.yaml and the tasks ask for, so doctor keeps their rows", async () => {
    daemon = await createTestDaemon();
    await writeFile(daemon.paths.config, "spec_writer: gemini:default:native\n");
    const doctor = await body<DoctorResponse>(await daemon.request("/doctor", { method: "POST" }));
    expect(doctor.named).toEqual(["gemini"]);
  });

  it("names the harness a task's own profile points at, with no spec_writer set", async () => {
    daemon = await createTestDaemon();
    const repo = await daemon.addRepo();
    const now = new Date().toISOString();
    daemon.ledger.tasks.insert({
      id: "a2b3c4d5e6",
      repoId: repo.id,
      title: "try cursor",
      prompt: "p",
      profileId: "cursor-agent:default:native",
      worktreePath: null,
      branch: null,
      status: "queued",
      origin: "agn",
      baseCommit: null,
      compareId: null,
      createdAt: now,
      updatedAt: now,
    });
    const doctor = await body<DoctorResponse>(await daemon.request("/doctor", { method: "POST" }));
    expect(doctor.named).toEqual(["cursor-agent"]);
  });

  it("keeps one row for a harness the spec writer and a task both name", async () => {
    daemon = await createTestDaemon();
    await writeFile(daemon.paths.config, "spec_writer: gemini:default:native\n");
    const repo = await daemon.addRepo();
    const now = new Date().toISOString();
    daemon.ledger.tasks.insert({
      id: "f2g3h4j5k6",
      repoId: repo.id,
      title: "also gemini",
      prompt: "p",
      profileId: "gemini:default:native",
      worktreePath: null,
      branch: null,
      status: "queued",
      origin: "agn",
      baseCommit: null,
      compareId: null,
      createdAt: now,
      updatedAt: now,
    });
    const doctor = await body<DoctorResponse>(await daemon.request("/doctor", { method: "POST" }));
    expect(doctor.named).toEqual(["gemini"]);
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

  it("keeps the appearance and terminal settings through a plan write", async () => {
    daemon = await createTestDaemon();
    await writeFile(
      daemon.paths.config,
      "appearance:\n  theme: ink\n  mode: light\nterminal:\n  font: Menlo\n  size: 15\n",
    );
    const response = await daemon.request("/doctor", {
      method: "POST",
      body: JSON.stringify({ plans: { claude: "pro" } }),
    });
    expect(response.status).toBe(200);
    const config = await readFile(daemon.paths.config, "utf8");
    expect(config).toContain("theme: ink");
    expect(config).toContain("mode: light");
    expect(config).toContain("font: Menlo");
    expect(config).toContain("size: 15");
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
