import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CatalogCheckState, CatalogRowsResponse, CatalogUpdateResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";
import { fixtureCatalog } from "../test-detection.js";

const REMOTE = fileURLToPath(new URL("../../../../tests/fixtures/catalog/remote", import.meta.url));
const PROFILE = "claude-code:opus:native";

let daemon: TestDaemon;
let published: { url: string; close(): Promise<void> } | null;

/** The published pair of files, on loopback: a test never reaches off this machine (ADR 002). */
async function publish(): Promise<string> {
  const body = await readFile(join(REMOTE, "catalog.json"), "utf8");
  const manifest = JSON.stringify({
    schemaVersion: 1,
    version: 2,
    generatedAt: "2026-09-08T00:00:00Z",
    sha256: createHash("sha256").update(body).digest("hex"),
  });
  const server: Server = createServer((req, res) => {
    const file =
      req.url === "/manifest.json" ? manifest : req.url === "/catalog.json" ? body : null;
    res.writeHead(file === null ? 404 : 200, { "content-type": "application/json" });
    res.end(file ?? "not found");
  });
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const { port } = server.address() as AddressInfo;
  published = {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
  return published.url;
}

/** The daemon starts a version behind what is published, so the first update has work to do. */
async function daemonBehind(catalogUrl?: string): Promise<TestDaemon> {
  return await createTestDaemon({
    catalog: { ...(await fixtureCatalog()), version: 1 },
    ...(catalogUrl === undefined ? {} : { catalogUrl }),
  });
}

beforeEach(() => {
  published = null;
});

afterEach(async () => {
  await daemon.close();
  await published?.close();
});

describe("GET /catalog/rows", () => {
  it("answers with the rows behind a profile and the catalog they came from", async () => {
    daemon = await createTestDaemon();
    const response = await daemon.request(`/catalog/rows?profile=${encodeURIComponent(PROFILE)}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as CatalogRowsResponse;
    expect(body.profileId).toBe(PROFILE);
    expect(body.catalog).toMatchObject({ version: 2, origin: "bundled", checkEnabled: false });
    expect(body.catalog.lastCheck).toBeNull();
    expect(body.cited).toBeNull();
  });

  it("refuses something that is not a profile id", async () => {
    daemon = await createTestDaemon();
    const response = await daemon.request("/catalog/rows?profile=claude-code");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid-profile-id" } });
  });

  it("refuses a request with no profile at all", async () => {
    daemon = await createTestDaemon();
    expect((await daemon.request("/catalog/rows")).status).toBe(400);
  });
});

describe("POST /catalog/update", () => {
  it("downloads once, then reports the same version as current", async () => {
    daemon = await daemonBehind(await publish());
    const first = (await (
      await daemon.request("/catalog/update", { method: "POST" })
    ).json()) as CatalogUpdateResponse;
    expect(first.update).toMatchObject({ outcome: "updated", localVersion: 1, remoteVersion: 2 });
    expect(first.catalog).toMatchObject({ version: 2, origin: "downloaded" });

    const second = (await (
      await daemon.request("/catalog/update", { method: "POST" })
    ).json()) as CatalogUpdateResponse;
    expect(second.update).toMatchObject({ outcome: "current", localVersion: 2 });

    const state = JSON.parse(
      await readFile(daemon.paths.catalogCheck, "utf8"),
    ) as CatalogCheckState;
    expect(state.outcome).toBe("current");
    // The row count of the file that is now on disk, which the CLI prints after an update.
    expect(first.update.benchmarkRows).toBe(4);
  });

  it("serves the downloaded rows once the update has landed", async () => {
    daemon = await daemonBehind(await publish());
    await daemon.request("/catalog/update", { method: "POST" });
    const body = (await (
      await daemon.request(`/catalog/rows?profile=${encodeURIComponent(PROFILE)}`)
    ).json()) as CatalogRowsResponse;
    expect(body.rows.map((row) => row.source)).toEqual(["terminal-bench", "livebench"]);
    expect(body.catalog.lastCheck).toMatchObject({ outcome: "updated" });
  });

  it("answers 502 when the far side does not, and keeps serving the catalog it has", async () => {
    daemon = await daemonBehind();
    const response = await daemon.request("/catalog/update", { method: "POST" });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: "catalog-fetch-failed" } });
    const rows = (await (
      await daemon.request(`/catalog/rows?profile=${encodeURIComponent(PROFILE)}`)
    ).json()) as CatalogRowsResponse;
    expect(rows.catalog.version).toBe(1);
    expect(rows.catalog.lastCheck).toMatchObject({ outcome: "failed" });
  });
});
