// The published catalog, on loopback, for the smoke run: `catalog-server.mjs <dir>` serves
// <dir>/catalog.json and a manifest generated from its bytes, so the two can never disagree.
// It binds an ephemeral port and prints it, so no test claims a port anything else might want.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const [dir] = process.argv.slice(2);
const body = readFileSync(join(dir, "catalog.json"), "utf8");
const manifest = JSON.stringify({
  schemaVersion: JSON.parse(body).schemaVersion,
  version: JSON.parse(body).version,
  generatedAt: JSON.parse(body).generatedAt,
  sha256: createHash("sha256").update(body).digest("hex"),
});

const server = createServer((req, res) => {
  const file = req.url === "/manifest.json" ? manifest : req.url === "/catalog.json" ? body : null;
  res.writeHead(file === null ? 404 : 200, { "content-type": "application/json" });
  res.end(file ?? "not found");
});
server.listen(0, "127.0.0.1", () => {
  process.stdout.write(`catalog server on ${server.address().port}\n`);
});
