import { readFile, writeFile } from "node:fs/promises";
import type { ApiErrorBody, ConfigResponse } from "@agnostic/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon();
});

afterEach(() => daemon.close());

function patch(body: string): Promise<Response> {
  return daemon.request("/config", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body,
  });
}

async function read(response: Response): Promise<ConfigResponse> {
  return (await response.json()) as ConfigResponse;
}

it("answers the whole config and the path of the file it came from", async () => {
  const response = await daemon.request("/config");
  expect(response.status).toBe(200);
  const body = await read(response);
  expect(body.file).toBe(daemon.paths.config);
  expect(body.config).toMatchObject({
    port: null,
    plans: {},
    editor: null,
    catalogCheck: true,
    specWriter: null,
    budget: { dailyUsd: null, weeklyUsd: null },
    hooks: { claudeStatusline: "user" },
    appearance: { theme: "rosewood", mode: "system" },
    terminal: { font: null, size: 13 },
  });
});

it("writes what the patch names and answers the file as it now reads", async () => {
  const written = await patch('{"appearance":{"theme":"ink"},"terminal":{"size":14}}');
  expect(written.status).toBe(200);
  expect((await read(written)).config).toMatchObject({
    appearance: { theme: "ink", mode: "system" },
    terminal: { font: null, size: 14 },
  });
  expect(await readFile(daemon.paths.config, "utf8")).toContain("theme: ink");
  expect((await read(await daemon.request("/config"))).config).toMatchObject({
    appearance: { theme: "ink" },
    terminal: { size: 14 },
  });
});

it("keeps the keys a later patch does not name", async () => {
  await patch('{"appearance":{"theme":"ink"}}');
  await patch('{"editor":"cursor"}');
  expect((await read(await daemon.request("/config"))).config).toMatchObject({
    appearance: { theme: "ink" },
    editor: "cursor",
  });
});

it("refuses a key nothing reads and a body that is not json", async () => {
  const unknown = await patch('{"theme":"x"}');
  expect(unknown.status).toBe(400);
  expect(((await unknown.json()) as ApiErrorBody).error.code).toBe("request-invalid");

  const malformed = await patch("not json");
  expect(malformed.status).toBe(400);
  expect(((await malformed.json()) as ApiErrorBody).error.code).toBe("request-invalid");
});

it("leaves the file as it was when the patch is refused, at the top level and inside a section", async () => {
  await writeFile(daemon.paths.config, "editor: cursor\nappearance:\n  theme: ink\n");
  const before = await readFile(daemon.paths.config, "utf8");

  const unknownTop = await patch('{"theme":"x"}');
  expect(unknownTop.status).toBe(400);
  expect(await readFile(daemon.paths.config, "utf8")).toBe(before);

  const unknownNested = await patch('{"appearance":{"colour":"ink"}}');
  expect(unknownNested.status).toBe(400);
  expect(await readFile(daemon.paths.config, "utf8")).toBe(before);
});

it("takes an empty body as a request for nothing, and still answers the file", async () => {
  const response = await patch("{}");
  expect(response.status).toBe(200);
  expect((await read(response)).file).toBe(daemon.paths.config);
});

it("answers 400 for a config.yaml that fails its own schema, not 500", async () => {
  await writeFile(daemon.paths.config, "appearance:\n  theme: midnight\n");
  const response = await daemon.request("/config");
  expect(response.status).toBe(400);
  expect(((await response.json()) as ApiErrorBody).error.code).toBe("ag-file-invalid");
});

it("refuses the request without the token", async () => {
  const response = await daemon.app.request("/config");
  expect(response.status).toBe(401);
});
