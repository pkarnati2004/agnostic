import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveUiDist, resolveUiFile, UI_CONTENT_TYPES, uiContentType } from "./ui-dist.js";

const DIST = "/home/agn/packages/ui/dist";

describe("resolveUiDist", () => {
  it("finds the dist of the installed workspace package", () => {
    const dist = resolveUiDist();
    expect(dist).not.toBeNull();
    expect(dist).toMatch(/packages[/\\]ui[/\\]dist$/);
  });
});

describe("resolveUiFile", () => {
  it("serves the page for the directory itself, with and without the trailing slash", async () => {
    expect(await resolveUiFile(DIST, "")).toBe(join(DIST, "index.html"));
    expect(await resolveUiFile(DIST, "/")).toBe(join(DIST, "index.html"));
  });

  it("resolves a file inside the build", async () => {
    expect(await resolveUiFile(DIST, "assets/app.js")).toBe(join(DIST, "assets/app.js"));
    expect(await resolveUiFile(DIST, "assets/fonts/mono.woff2")).toBe(
      join(DIST, "assets/fonts/mono.woff2"),
    );
  });

  it("refuses anything that leaves the build", async () => {
    expect(await resolveUiFile(DIST, "../package.json")).toBeNull();
    expect(await resolveUiFile(DIST, "assets/../../x")).toBeNull();
    expect(await resolveUiFile(DIST, "/etc/passwd")).toBeNull();
    expect(await resolveUiFile(DIST, "assets/app.js\0.png")).toBeNull();
  });

  it("refuses the build directory itself, so a request can never list it", async () => {
    expect(await resolveUiFile(DIST, "assets/..")).toBeNull();
  });

  it("does not decode a percent-encoded separator: it stays a literal filename inside the build", async () => {
    // The subpath is already what the router decided the path means; resolveUiFile does no
    // decoding of its own, so "%2f" here names a file called "%2f", not a traversal.
    expect(await resolveUiFile(DIST, "..%2fpackage.json")).toBe(join(DIST, "..%2fpackage.json"));
    expect(await resolveUiFile(DIST, "assets%2f..%2f..%2fx")).toBe(
      join(DIST, "assets%2f..%2f..%2fx"),
    );
  });
});

describe("resolveUiFile over a build on disk", () => {
  let dist: string;
  let outside: string;

  beforeEach(async () => {
    dist = await mkdtemp(join(tmpdir(), "agn-dist-"));
    outside = await mkdtemp(join(tmpdir(), "agn-outside-"));
    await mkdir(join(dist, "assets"), { recursive: true });
    await writeFile(join(dist, "assets", "app.js"), "", "utf8");
    await writeFile(join(outside, "secret.txt"), "", "utf8");
  });

  afterEach(async () => {
    await rm(dist, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it("refuses a symlink whose target is outside the build", async () => {
    await symlink(join(outside, "secret.txt"), join(dist, "assets", "escape.js"));
    expect(await resolveUiFile(dist, "assets/escape.js")).toBeNull();
  });

  it("keeps a symlink whose target is inside the build", async () => {
    await symlink(join(dist, "assets", "app.js"), join(dist, "assets", "alias.js"));
    expect(await resolveUiFile(dist, "assets/alias.js")).toBe(join(dist, "assets", "alias.js"));
  });

  it("keeps a name with nothing behind it, so a missing page is still the page", async () => {
    expect(await resolveUiFile(dist, "")).toBe(join(dist, "index.html"));
    expect(await resolveUiFile(dist, "assets/gone.js")).toBe(join(dist, "assets", "gone.js"));
  });
});

describe("UI_CONTENT_TYPES", () => {
  it("names every extension Vite emits", () => {
    expect(Object.keys(UI_CONTENT_TYPES)).toEqual([
      ".html",
      ".js",
      ".css",
      ".svg",
      ".json",
      ".map",
      ".woff2",
      ".png",
      ".ico",
    ]);
  });

  it("falls back to bytes for anything else", () => {
    expect(uiContentType("/dist/index.html")).toBe("text/html; charset=utf-8");
    expect(uiContentType("/dist/assets/app-abc123.JS")).toBe("text/javascript; charset=utf-8");
    expect(uiContentType("/dist/assets/logo.webp")).toBe("application/octet-stream");
    expect(uiContentType("/dist/LICENSE")).toBe("application/octet-stream");
  });

  it("names the exact type of every one of the nine rows", () => {
    expect(uiContentType("/dist/index.html")).toBe("text/html; charset=utf-8");
    expect(uiContentType("/dist/assets/app.js")).toBe("text/javascript; charset=utf-8");
    expect(uiContentType("/dist/assets/app.css")).toBe("text/css; charset=utf-8");
    expect(uiContentType("/dist/assets/logo.svg")).toBe("image/svg+xml");
    expect(uiContentType("/dist/manifest.json")).toBe("application/json");
    expect(uiContentType("/dist/assets/app.js.map")).toBe("application/json");
    expect(uiContentType("/dist/assets/mono.woff2")).toBe("font/woff2");
    expect(uiContentType("/dist/favicon.png")).toBe("image/png");
    expect(uiContentType("/dist/favicon.ico")).toBe("image/x-icon");
  });
});
