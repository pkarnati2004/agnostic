import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "@agnostic/core";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = join(root, "build", "npm");
const desktop = join(root, "packages", "desktop");
const app = join(desktop, "build", "app");

type BundleManifest = { version: string; dependencies: Record<string, string> };

/** The app ships `pnpm pack:npm`'s bundle as it is: agnd.js finds ui/ and catalog.json beside it. */
function copyBundle(): void {
  const dist = join(bundle, "dist");
  if (!existsSync(join(dist, "agnd.js"))) {
    throw new Error(`${dist}/agnd.js is missing: run pnpm pack:npm`);
  }
  const agnd = join(app, "agnd");
  mkdirSync(agnd, { recursive: true });
  cpSync(join(dist, "agnd.js"), join(agnd, "agnd.js"));
  cpSync(join(dist, "catalog.json"), join(agnd, "catalog.json"));
  cpSync(join(dist, "ui"), join(agnd, "ui"), { recursive: true });
}

/** Main is ESM; the preloads are CommonJS because a sandboxed preload cannot load a module. */
async function bundleShell(): Promise<void> {
  const dist = join(desktop, "dist");
  const shared = {
    bundle: true,
    platform: "node",
    target: "node22",
    external: ["electron"],
    sourcemap: false,
    logLevel: "error",
  } as const;
  await build({
    ...shared,
    entryPoints: { main: join(dist, "main.js") },
    outdir: app,
    format: "esm",
    // execa and zod are CommonJS in places; an ESM bundle has no require of its own.
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
    },
  });
  await build({
    ...shared,
    entryPoints: {
      "preload-workspace": join(dist, "preload-workspace.js"),
      "preload-status": join(dist, "preload-status.js"),
    },
    outdir: app,
    outExtension: { ".js": ".cjs" },
    format: "cjs",
  });
  for (const file of ["status.html", "status.js"]) {
    cpSync(join(desktop, "src", file), join(app, file));
  }
}

/** Generated like chunk 35's manifest: the bundle's version and its two native pins, typed once. */
function writeManifest(): void {
  const published = JSON.parse(
    readFileSync(join(bundle, "package.json"), "utf8"),
  ) as BundleManifest;
  const manifest = {
    name: "agnostic",
    productName: "agnostic",
    version: published.version,
    main: "main.js",
    type: "module",
    dependencies: published.dependencies,
  };
  writeFileSync(join(app, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main(): Promise<void> {
  rmSync(app, { recursive: true, force: true });
  copyBundle();
  await bundleShell();
  writeManifest();
  // Build time only: npm fetches the two natives, then they are rebuilt for Electron's ABI. A
  // failed rebuild fails the stage rather than shipping a binary that dies at dlopen in the app.
  await run("npm", ["install", "--omit=dev", "--no-package-lock", "--no-fund", "--no-audit"], {
    cwd: app,
  });
  await run(
    "pnpm",
    [
      "--filter",
      "@agnostic/desktop",
      "exec",
      "electron-rebuild",
      "--module-dir",
      app,
      "--only",
      "better-sqlite3,node-pty",
      "--force",
    ],
    { cwd: root },
  );
  console.log(app);
}

await main();
