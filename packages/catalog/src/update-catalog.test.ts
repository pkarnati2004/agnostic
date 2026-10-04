import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CatalogManifest } from "./catalog-manifest.js";
import type { CatalogSource } from "./catalog-source.js";
import { CatalogError } from "./error.js";
import { testVendorOf } from "./test-vendors.js";
import { updateCatalog } from "./update-catalog.js";

const REMOTE = fileURLToPath(new URL("../../../tests/fixtures/catalog/remote", import.meta.url));
const SOURCE: CatalogSource = {
  manifestUrl: "http://catalog.test/manifest.json",
  fileUrl: "http://catalog.test/catalog.json",
};
const ON_DISK = '{"already":"here"}';

let home: string;
let downloaded: string;
let asked: string[];

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-catalog-"));
  downloaded = join(home, "catalog.json");
  asked = [];
});

afterEach(() => rm(home, { recursive: true, force: true }));

function manifestFor(body: string, over: Partial<CatalogManifest> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    version: 2,
    generatedAt: "2026-09-08T00:00:00Z",
    sha256: createHash("sha256").update(body).digest("hex"),
    ...over,
  });
}

/** A fetch that answers from a map and records what was asked for; nothing leaves the process. */
function serving(files: Record<string, string>): typeof fetch {
  return (input) => {
    const url = String(input);
    asked.push(url);
    const body = files[url];
    if (body === undefined) {
      return Promise.resolve(new Response("not found", { status: 404 }));
    }
    return Promise.resolve(new Response(body));
  };
}

async function remoteCatalog(name = "catalog.json"): Promise<string> {
  return await readFile(join(REMOTE, name), "utf8");
}

async function failure(promise: Promise<unknown>): Promise<CatalogError> {
  const caught = await promise.catch((cause: unknown) => cause);
  expect(caught).toBeInstanceOf(CatalogError);
  return caught as CatalogError;
}

describe("updateCatalog", () => {
  it("downloads a newer catalog and replaces the file on disk", async () => {
    const body = await remoteCatalog();
    const update = await updateCatalog({
      vendorOf: testVendorOf,
      source: SOURCE,
      localVersion: 1,
      downloaded,
      fetch: serving({ [SOURCE.manifestUrl]: manifestFor(body), [SOURCE.fileUrl]: body }),
    });
    expect(update).toEqual({
      outcome: "updated",
      localVersion: 1,
      remoteVersion: 2,
      generatedAt: "2026-09-08T00:00:00Z",
      remoteSchemaVersion: 1,
      localSchemaVersion: 1,
      benchmarkRows: 4,
    });
    expect(await readFile(downloaded, "utf8")).toBe(body);
    await expect(readFile(`${downloaded}.tmp`, "utf8")).rejects.toThrow();
  });

  it("updates when there is no catalog on disk at all", async () => {
    const body = await remoteCatalog();
    const update = await updateCatalog({
      vendorOf: testVendorOf,
      source: SOURCE,
      localVersion: 0,
      downloaded,
      fetch: serving({ [SOURCE.manifestUrl]: manifestFor(body), [SOURCE.fileUrl]: body }),
    });
    expect(update.outcome).toBe("updated");
  });

  it("stops at the manifest when nothing newer was published", async () => {
    const update = await updateCatalog({
      vendorOf: testVendorOf,
      source: SOURCE,
      localVersion: 2,
      downloaded,
      fetch: serving({ [SOURCE.manifestUrl]: manifestFor("{}") }),
    });
    expect(update.outcome).toBe("current");
    expect(update.benchmarkRows).toBeNull();
    expect(asked).toEqual([SOURCE.manifestUrl]);
  });

  it("downloads nothing when the published catalog needs a newer agn", async () => {
    const update = await updateCatalog({
      vendorOf: testVendorOf,
      source: SOURCE,
      localVersion: 1,
      downloaded,
      fetch: serving({ [SOURCE.manifestUrl]: manifestFor("{}", { schemaVersion: 2 }) }),
    });
    expect(update).toMatchObject({
      outcome: "unsupported",
      remoteSchemaVersion: 2,
      localSchemaVersion: 1,
    });
    expect(asked).toEqual([SOURCE.manifestUrl]);
  });

  it("refuses a download whose checksum is not the one the manifest published", async () => {
    await writeFile(downloaded, ON_DISK, "utf8");
    const body = await remoteCatalog();
    const error = await failure(
      updateCatalog({
        vendorOf: testVendorOf,
        source: SOURCE,
        localVersion: 1,
        downloaded,
        fetch: serving({
          [SOURCE.manifestUrl]: manifestFor(`${body} `),
          [SOURCE.fileUrl]: body,
        }),
      }),
    );
    expect(error.code).toBe("catalog-checksum-mismatch");
    expect(await readFile(downloaded, "utf8")).toBe(ON_DISK);
  });

  it("refuses a download that is not a catalog, and keeps the one on disk", async () => {
    await writeFile(downloaded, ON_DISK, "utf8");
    const body = "not json at all";
    const error = await failure(
      updateCatalog({
        vendorOf: testVendorOf,
        source: SOURCE,
        localVersion: 1,
        downloaded,
        fetch: serving({ [SOURCE.manifestUrl]: manifestFor(body), [SOURCE.fileUrl]: body }),
      }),
    );
    expect(error.code).toBe("catalog-malformed");
    expect(await readFile(downloaded, "utf8")).toBe(ON_DISK);
  });

  it("refuses a download whose own version is not the one the manifest promised", async () => {
    const body = await remoteCatalog("catalog-wrong-version.json");
    const error = await failure(
      updateCatalog({
        vendorOf: testVendorOf,
        source: SOURCE,
        localVersion: 1,
        downloaded,
        fetch: serving({ [SOURCE.manifestUrl]: manifestFor(body), [SOURCE.fileUrl]: body }),
      }),
    );
    expect(error.code).toBe("catalog-version-mismatch");
    expect(error.message).toContain("version 3");
  });

  it("reports a manifest that is not a manifest", async () => {
    const error = await failure(
      updateCatalog({
        vendorOf: testVendorOf,
        source: SOURCE,
        localVersion: 1,
        downloaded,
        fetch: serving({ [SOURCE.manifestUrl]: '{"version":"two"}' }),
      }),
    );
    expect(error.code).toBe("catalog-manifest-invalid");
  });

  it("keeps the plain hint for a status other than 404, which says nothing about the repo", async () => {
    const error = await failure(
      updateCatalog({
        source: SOURCE,
        localVersion: 14,
        downloaded,
        fetch: () => Promise.resolve(new Response("down", { status: 503 })),
      }),
    );
    expect(error.message).toBe(`could not fetch ${SOURCE.manifestUrl}: HTTP 503`);
    expect(error.hint).toBe("The catalog on disk (14) stays in use.");
  });

  it("reports a request that is answered with a status, and says which catalog stays in use", async () => {
    const error = await failure(
      updateCatalog({
        vendorOf: testVendorOf,
        source: SOURCE,
        localVersion: 14,
        downloaded,
        fetch: serving({}),
      }),
    );
    expect(error.code).toBe("catalog-fetch-failed");
    expect(error.message).toBe(`could not fetch ${SOURCE.manifestUrl}: HTTP 404`);
    expect(error.hint).toBe(
      "The catalog repo is missing or private. The catalog on disk (14) stays in use.",
    );
  });

  it("reports a request that timed out in the words the user reads", async () => {
    const timedOut: typeof fetch = () => {
      const error = new Error("The operation was aborted due to timeout");
      error.name = "TimeoutError";
      return Promise.reject(error);
    };
    const error = await failure(
      updateCatalog({
        vendorOf: testVendorOf,
        source: SOURCE,
        localVersion: 1,
        downloaded,
        fetch: timedOut,
      }),
    );
    expect(error.code).toBe("catalog-fetch-failed");
    expect(error.message).toContain("timed out");
  });

  it("reports a refused connection, and never touches the file on disk", async () => {
    await writeFile(downloaded, ON_DISK, "utf8");
    // Bind, then close: a loopback port nothing is listening on, never a real host.
    const server: Server = createServer(() => undefined);
    await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
    const { port } = server.address() as AddressInfo;
    await new Promise<void>((done) => server.close(() => done()));
    const closed: CatalogSource = {
      manifestUrl: `http://127.0.0.1:${port}/manifest.json`,
      fileUrl: `http://127.0.0.1:${port}/catalog.json`,
    };
    const error = await failure(
      updateCatalog({ vendorOf: testVendorOf, source: closed, localVersion: 1, downloaded }),
    );
    expect(error.code).toBe("catalog-fetch-failed");
    expect(await readFile(downloaded, "utf8")).toBe(ON_DISK);
  });

  it("refuses a redirect off the configured host, and never touches the file on disk", async () => {
    await writeFile(downloaded, ON_DISK, "utf8");
    const server: Server = createServer((_req, res) => {
      res.writeHead(302, { location: "/elsewhere.json" });
      res.end();
    });
    await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
    const { port } = server.address() as AddressInfo;
    const redirecting: CatalogSource = {
      manifestUrl: `http://127.0.0.1:${port}/manifest.json`,
      fileUrl: `http://127.0.0.1:${port}/catalog.json`,
    };
    const error = await failure(
      updateCatalog({ vendorOf: testVendorOf, source: redirecting, localVersion: 1, downloaded }),
    );
    await new Promise<void>((done) => server.close(() => done()));
    expect(error.code).toBe("catalog-fetch-failed");
    expect(await readFile(downloaded, "utf8")).toBe(ON_DISK);
  });
});
