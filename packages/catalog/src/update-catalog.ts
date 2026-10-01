import { createHash } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CatalogUpdate } from "@agnostic/core";
import { type CatalogManifest, CatalogManifestSchema } from "./catalog-manifest.js";
import {
  CATALOG_SCHEMA_VERSION,
  type Catalog,
  parseCatalog,
  type VendorOf,
} from "./catalog-schema.js";
import type { CatalogSource } from "./catalog-source.js";
import { CatalogError } from "./error.js";

const DEFAULT_TIMEOUT_MS = 10_000;

/** A manifest is four fields; a catalog is a few hundred KB of rows. Anything past these is not ours. */
const MANIFEST_MAX_BYTES = 64 * 1024;
const CATALOG_MAX_BYTES = 8 * 1024 * 1024;

/**
 * The one call agn makes off this machine (ADR 002): a GET of the manifest, and a GET of the
 * catalog only when the manifest names a version newer than the one already in use. A download
 * replaces `downloaded` only once its checksum, its schema and its version all agree with the
 * manifest; until then the file on disk is untouched and keeps serving.
 */
export async function updateCatalog(opts: {
  source: CatalogSource;
  localVersion: number;
  downloaded: string;
  vendorOf: VendorOf;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): Promise<CatalogUpdate> {
  const get = reader(opts.fetch ?? fetch, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.localVersion);
  const manifest = await readManifest(await get(opts.source.manifestUrl, MANIFEST_MAX_BYTES));
  const found: Omit<CatalogUpdate, "outcome" | "benchmarkRows"> = {
    localVersion: opts.localVersion,
    remoteVersion: manifest.version,
    generatedAt: manifest.generatedAt,
    remoteSchemaVersion: manifest.schemaVersion,
    localSchemaVersion: CATALOG_SCHEMA_VERSION,
  };
  // Nothing newer is the everyday answer, and it costs the second request nothing.
  if (manifest.version <= opts.localVersion) {
    return { ...found, outcome: "current", benchmarkRows: null };
  }
  if (manifest.schemaVersion > CATALOG_SCHEMA_VERSION) {
    return { ...found, outcome: "unsupported", benchmarkRows: null };
  }
  const body = await get(opts.source.fileUrl, CATALOG_MAX_BYTES);
  const catalog = verify(body, manifest, opts.source.fileUrl, opts);
  await replace(opts.downloaded, body);
  return { ...found, outcome: "updated", benchmarkRows: catalog.benchmarks.length };
}

/** Checksum, then schema, then the version the manifest promised: cheapest rejection first. */
function verify(
  body: string,
  manifest: CatalogManifest,
  url: string,
  opts: { vendorOf: VendorOf },
): Catalog {
  const digest = createHash("sha256").update(body).digest("hex");
  if (digest !== manifest.sha256) {
    throw new CatalogError(`${url} does not match the checksum in the manifest`, {
      code: "catalog-checksum-mismatch",
      hint: "Try again; if it persists, the published catalog and its manifest disagree.",
    });
  }
  const catalog = parseCatalog(json(body, url), opts);
  if (catalog.version !== manifest.version) {
    throw new CatalogError(
      `${url} is version ${catalog.version} and its manifest says ${manifest.version}`,
      {
        code: "catalog-version-mismatch",
        hint: "Try again; if it persists, the published catalog and its manifest disagree.",
      },
    );
  }
  return catalog;
}

function readManifest(body: string): CatalogManifest {
  const parsed = CatalogManifestSchema.safeParse(json(body, "the catalog manifest"));
  if (!parsed.success) {
    throw new CatalogError("the catalog manifest is not valid", {
      code: "catalog-manifest-invalid",
      hint: "Try again later: the published manifest is being rewritten or is damaged.",
      cause: parsed.error,
    });
  }
  return parsed.data;
}

function json(body: string, what: string): unknown {
  try {
    return JSON.parse(body);
  } catch (cause) {
    throw new CatalogError(`${what} is not JSON`, {
      code: "catalog-malformed",
      hint: "Try again later: the published file is being rewritten or is damaged.",
      cause,
    });
  }
}

/**
 * One GET, no redirect off the configured base, a timeout, and a cap on the bytes read, because
 * the far side is not trusted to be the size it should be: a mirror or a hijacked override could
 * otherwise stream forever into memory. A declared length over the cap is refused before the body
 * is touched; a body sent without one is cut off as soon as it crosses.
 */
function reader(
  doFetch: typeof fetch,
  timeoutMs: number,
  localVersion: number,
): (url: string, maxBytes: number) => Promise<string> {
  return async (url, maxBytes) => {
    let response: Response;
    try {
      response = await doFetch(url, {
        headers: { accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      throw fetchFailed(url, reason(cause), localVersion, cause);
    }
    if (!response.ok) {
      throw fetchFailed(url, `HTTP ${response.status}`, localVersion, undefined);
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw tooLarge(url, maxBytes, localVersion);
    }
    try {
      return await readCapped(response, url, maxBytes, localVersion);
    } catch (cause) {
      if (cause instanceof CatalogError) {
        throw cause;
      }
      throw fetchFailed(url, reason(cause), localVersion, cause);
    }
  };
}

/** Counts the bytes as they arrive and hangs up at the cap, so an endless body costs that much. */
async function readCapped(
  response: Response,
  url: string,
  maxBytes: number,
  localVersion: number,
): Promise<string> {
  if (response.body === null) {
    return "";
  }
  const stream = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let read = 0;
  while (true) {
    const chunk = await stream.read();
    if (chunk.done) {
      return text + decoder.decode();
    }
    read += chunk.value.byteLength;
    if (read > maxBytes) {
      await stream.cancel();
      throw tooLarge(url, maxBytes, localVersion);
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
}

function fetchFailed(url: string, why: string, localVersion: number, cause: unknown): CatalogError {
  return new CatalogError(`could not fetch ${url}: ${why}`, {
    code: "catalog-fetch-failed",
    hint: `The catalog on disk (${localVersion}) stays in use.`,
    cause,
  });
}

function tooLarge(url: string, maxBytes: number, localVersion: number): CatalogError {
  const cap = size(maxBytes);
  return new CatalogError(`could not fetch ${url}: it is larger than ${cap}`, {
    code: "catalog-fetch-failed",
    hint: `agn reads at most ${cap} from that URL; the catalog on disk (${localVersion}) stays in use.`,
  });
}

function size(bytes: number): string {
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb} KB` : `${kb / 1024} MB`;
}

/** Written beside the target and renamed, so a reader sees the old file or the new one. */
async function replace(path: string, body: string): Promise<void> {
  const temp = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temp, body, "utf8");
    await rename(temp, path);
  } catch (cause) {
    await rm(temp, { force: true });
    throw new CatalogError(`cannot write ${path}`, {
      code: "catalog-unwritable",
      hint: "Check the permissions on ~/.agnostic.",
      cause,
    });
  }
}

function reason(cause: unknown): string {
  if (cause instanceof Error) {
    // A timeout arrives as a DOMException named TimeoutError, whose message is "The operation was aborted".
    return cause.name === "TimeoutError" ? "timed out" : cause.message;
  }
  return String(cause);
}
