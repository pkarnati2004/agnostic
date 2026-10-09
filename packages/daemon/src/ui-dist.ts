import { realpath } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const INDEX = "index.html";

/** What Vite emits, plus what a shadcn component or a font may pull in. */
export const UI_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".map": "application/json",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export function uiContentType(file: string): string {
  return UI_CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
}

/**
 * The package is resolved rather than imported: the daemon never loads a byte of the page, and a
 * checkout that has not been built still starts, answering `/ui` with a 404 that says to build.
 */
export function resolveUiDist(): string | null {
  try {
    return join(dirname(fileURLToPath(import.meta.resolve("@agnostic/ui/package.json"))), "dist");
  } catch {
    // The page is not installed next to the daemon, so `/ui` answers 404 and the rest serves.
    return null;
  }
}

/**
 * The file `/ui/<subpath>` names, or null when it is not inside the build: a subpath that is
 * absolute, climbs out with `..`, or carries a NUL is refused rather than normalised, and so is
 * one whose real path leaves the build through a symlink. "" and "/" are the page itself;
 * nothing here lists a directory.
 */
export async function resolveUiFile(distDir: string, subpath: string): Promise<string | null> {
  const root = resolve(distDir);
  const file = named(root, subpath);
  if (file === null || !(await insideBuild(root, file))) {
    return null;
  }
  return file;
}

function named(root: string, subpath: string): string | null {
  if (subpath === "" || subpath === "/") {
    return join(root, INDEX);
  }
  if (subpath.startsWith("/") || subpath.includes("\0")) {
    return null;
  }
  const file = resolve(root, subpath);
  return file.startsWith(root + sep) ? file : null;
}

/**
 * A path string under the build is not the same as a file in it: `pnpm build` writes no symlinks,
 * so one that points out of the build is not part of it. A name with nothing behind it stays in,
 * to be answered by the 404 - or the "not built" - the caller already has for a missing file.
 */
async function insideBuild(root: string, file: string): Promise<boolean> {
  const real = await realpath(file).catch(() => null);
  if (real === null) {
    return true;
  }
  const realRoot = await realpath(root).catch(() => root);
  return real === realRoot || real.startsWith(realRoot + sep);
}

/** Whether the resolved file is the page: a missing one means the build is missing, not the file. */
export function isUiIndex(distDir: string, file: string): boolean {
  return file === join(resolve(distDir), INDEX);
}
