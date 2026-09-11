import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MAX_LINES = 300;

function typescriptFilesIn(dir: string, recursive: boolean): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        files.push(...typescriptFilesIn(path, recursive));
      }
    } else if (entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

function sourceFiles(): string[] {
  const packages = readdirSync("packages", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => typescriptFilesIn(join("packages", entry.name, "src"), true));
  return [...packages, ...typescriptFilesIn("scripts", false)].sort();
}

const tooLong = sourceFiles()
  .map((path) => ({ path, lines: readFileSync(path, "utf8").split("\n").length }))
  .filter((file) => file.lines > MAX_LINES);

for (const file of tooLong) {
  console.error(`${file.path}: ${file.lines} lines (max ${MAX_LINES})`);
}
if (tooLong.length > 0) {
  console.error("Split by concept, not mechanically.");
  process.exit(1);
}
