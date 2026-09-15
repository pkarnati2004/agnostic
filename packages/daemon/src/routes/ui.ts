import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { DaemonError } from "../error.js";
import { isUiIndex, resolveUiFile, uiContentType } from "../ui-dist.js";

/** Vite hashes every name under `assets/`, so a file there can never change under a client. */
const ASSET_CACHE = "public, max-age=31536000, immutable";

/**
 * The built workspace, served without a token: the page carries nothing secret until the browser
 * hands it the one in the URL fragment (ADR 026). The token never reaches this route.
 */
export function uiRoutes(ctx: DaemonContext): Hono {
  return new Hono().on(["GET", "HEAD"], ["/ui", "/ui/*"], async (c) => {
    const dist = ctx.uiDist;
    if (dist === null) {
      throw notBuilt();
    }
    const file = await resolveUiFile(dist, subpathOf(c.req.path));
    if (file === null) {
      return c.notFound();
    }
    const found = await stat(file).catch(() => null);
    if (found === null || !found.isFile()) {
      // A missing index.html is a checkout nobody built; a missing asset is only a bad path.
      if (isUiIndex(dist, file)) {
        throw notBuilt();
      }
      return c.notFound();
    }
    const headers = {
      "content-type": uiContentType(file),
      "content-length": String(found.size),
      "cache-control": c.req.path.startsWith("/ui/assets/") ? ASSET_CACHE : "no-cache",
    };
    if (c.req.method === "HEAD") {
      return c.body(null, 200, headers);
    }
    return c.body(Readable.toWeb(createReadStream(file)), 200, headers);
  });
}

/** What follows `/ui`, with the one separating slash removed: `/ui/assets/a.js` is `assets/a.js`. */
function subpathOf(path: string): string {
  const rest = path.slice("/ui".length);
  return rest.startsWith("/") ? rest.slice(1) : rest;
}

function notBuilt(): DaemonError {
  return new DaemonError("the workspace is not built", {
    code: "ui-not-built",
    hint: "Run pnpm build.",
  });
}
