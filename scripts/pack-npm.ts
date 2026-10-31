import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "@agnostic/core";
import { build } from "esbuild";
import {
  NATIVE_DEPENDENCIES,
  nativePins,
  OPTIONAL_EXTERNALS,
  publishedManifest,
  type WorkspaceManifest,
} from "./npm-manifest.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "build", "npm");
const dist = join(out, "dist");

function readManifest(path: string): WorkspaceManifest {
  return JSON.parse(readFileSync(path, "utf8")) as WorkspaceManifest;
}

function workspaceManifests(): WorkspaceManifest[] {
  const packages = join(root, "packages");
  return readdirSync(packages, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packages, entry.name, "package.json"))
    .filter((path) => existsSync(path))
    .map(readManifest);
}

async function bundle(): Promise<void> {
  await build({
    entryPoints: {
      main: join(root, "packages/cli/dist/main.js"),
      agnd: join(root, "packages/daemon/dist/main.js"),
    },
    outdir: dist,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: [...NATIVE_DEPENDENCIES, ...OPTIONAL_EXTERNALS],
    // ws is CommonJS and calls require() for its optional accelerators; an ESM bundle has no
    // require of its own, so this one lets those calls fail inside ws's try/catch as they do today.
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
    },
    sourcemap: false,
    minify: false,
    logLevel: "error",
  });
  chmodSync(join(dist, "main.js"), 0o755);
}

function copyAssets(): void {
  const page = join(root, "packages/ui/dist");
  if (!existsSync(join(page, "index.html"))) {
    throw new Error(`${page}/index.html is missing: run pnpm build`);
  }
  cpSync(join(root, "packages/catalog/src/catalog.json"), join(dist, "catalog.json"));
  cpSync(page, join(dist, "ui"), { recursive: true });
  cpSync(join(root, "README.md"), join(out, "README.md"));
  cpSync(join(root, "LICENSE"), join(out, "LICENSE"));
}

async function main(): Promise<void> {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  await bundle();
  copyAssets();
  const manifest = publishedManifest(
    readManifest(join(root, "packages/cli/package.json")),
    nativePins(workspaceManifests()),
  );
  writeFileSync(join(out, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const packed = await run("npm", ["pack", "--pack-destination", out], { cwd: out });
  // npm prints the tarball's file name as its last stdout line; the smoke reads the path from ours.
  const tarball = packed.stdout.trim().split("\n").at(-1) ?? "";
  console.log(join(out, tarball));
}

await main();
