import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  type AgnosticPaths,
  agnosticPaths,
  ConfigError,
  defaultRepoConfig,
  newId,
  run,
  worktreePath,
  writeRepoConfig,
} from "@agnostic/core";
import { type Ledger, openLedger } from "@agnostic/ledger";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DaemonError } from "./error.js";
import { registerRepo } from "./register-repo.js";

let home: string;
let workspace: string;
let ledger: Ledger;
let paths: AgnosticPaths;

beforeEach(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), "agn-home-")));
  workspace = await realpath(await mkdtemp(join(tmpdir(), "agn-work-")));
  paths = agnosticPaths(home);
  ledger = openLedger(paths.db);
});

afterEach(async () => {
  ledger.close();
  await rm(home, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

async function folder(name: string): Promise<string> {
  const path = join(workspace, name);
  await mkdir(path, { recursive: true });
  return path;
}

async function gitRepo(name: string): Promise<string> {
  const path = await folder(name);
  await run("git", ["init"], { cwd: path });
  return path;
}

describe("registerRepo", () => {
  it("registers a git repo with its basename and kind", async () => {
    const path = await gitRepo("alpha");
    const { repo, created } = await registerRepo(ledger, paths, { path });
    expect(created).toBe(true);
    expect(repo).toMatchObject({ path, kind: "git", name: "alpha" });
    expect(ledger.events.after(0).map((event) => event.kind)).toEqual(["repo.registered"]);
  });

  it("registers a plain folder as kind folder", async () => {
    const { repo } = await registerRepo(ledger, paths, { path: await folder("notes") });
    expect(repo.kind).toBe("folder");
  });

  it("is idempotent for the same path", async () => {
    const path = await gitRepo("alpha");
    const first = await registerRepo(ledger, paths, { path });
    const second = await registerRepo(ledger, paths, { path });
    expect(second.created).toBe(false);
    expect(second.repo.id).toBe(first.repo.id);
    expect(ledger.events.after(0)).toHaveLength(1);
  });

  it("upgrades a folder that has since become a git repo", async () => {
    const path = await folder("later");
    await registerRepo(ledger, paths, { path });
    await run("git", ["init"], { cwd: path });
    const { repo, created } = await registerRepo(ledger, paths, { path });
    expect(created).toBe(false);
    expect(repo.kind).toBe("git");
    expect(ledger.events.after(0).map((event) => event.kind)).toEqual([
      "repo.registered",
      "repo.updated",
    ]);
  });

  it("runs git init when asked", async () => {
    const path = await folder("fresh");
    const { repo } = await registerRepo(ledger, paths, { path, gitInit: true });
    expect(repo.kind).toBe("git");
    expect((await run("git", ["rev-parse", "--is-inside-work-tree"], { cwd: path })).stdout).toBe(
      "true",
    );
  });

  it("adopts the id in .ag/agnostic.yaml", async () => {
    const path = await gitRepo("declared");
    const id = newId();
    await writeRepoConfig(path, defaultRepoConfig(id));
    const { repo } = await registerRepo(ledger, paths, { path });
    expect(repo.id).toBe(id);
  });

  it("refuses a second clone whose id is registered at a path that still exists", async () => {
    const id = newId();
    const first = await gitRepo("clone-one");
    await writeRepoConfig(first, defaultRepoConfig(id));
    await registerRepo(ledger, paths, { path: first });
    const second = await gitRepo("clone-two");
    await writeRepoConfig(second, defaultRepoConfig(id));
    const error = await registerRepo(ledger, paths, { path: second }).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(DaemonError);
    expect((error as DaemonError).code).toBe("repo-id-registered");
    expect((error as DaemonError).message).toBe(`this repo id is already registered at ${first}`);
    expect((error as DaemonError).hint).toBe("Use `agn add --new-id` to register a second clone.");
  });

  it("mints a new id when asked for one", async () => {
    const id = newId();
    const first = await gitRepo("clone-one");
    await writeRepoConfig(first, defaultRepoConfig(id));
    await registerRepo(ledger, paths, { path: first });
    const second = await gitRepo("clone-two");
    await writeRepoConfig(second, defaultRepoConfig(id));
    const { repo, created } = await registerRepo(ledger, paths, { path: second, newId: true });
    expect(created).toBe(true);
    expect(repo.id).not.toBe(id);
    expect(ledger.repos.list()).toHaveLength(2);
  });

  it("follows a repo that moved, when the registered path is gone", async () => {
    const id = newId();
    const first = await gitRepo("before-move");
    await writeRepoConfig(first, defaultRepoConfig(id));
    await registerRepo(ledger, paths, { path: first });
    await rm(first, { recursive: true, force: true });
    const moved = await gitRepo("after-move");
    await writeRepoConfig(moved, defaultRepoConfig(id));
    const { repo, created } = await registerRepo(ledger, paths, { path: moved });
    expect(created).toBe(false);
    expect(repo.id).toBe(id);
    expect(repo.path).toBe(moved);
    expect(repo.name).toBe(basename(moved));
    expect(ledger.repos.list()).toHaveLength(1);
  });

  it("reactivates a removed repo, created true, same id, back to active", async () => {
    const path = await gitRepo("alpha");
    const first = await registerRepo(ledger, paths, { path });
    ledger.repos.update(first.repo.id, { status: "removed" });

    const { repo, created } = await registerRepo(ledger, paths, { path });
    expect(created).toBe(true);
    expect(repo.id).toBe(first.repo.id);
    expect(repo.status).toBe("active");
    expect(ledger.events.after(0).map((event) => event.kind)).toEqual([
      "repo.registered",
      "repo.updated",
      "repo.updated",
    ]);
  });

  it("keeps an archived repo closed and created false, unlike a removed one", async () => {
    const path = await gitRepo("alpha");
    const first = await registerRepo(ledger, paths, { path });
    ledger.repos.update(first.repo.id, { status: "archived" });

    const { repo, created } = await registerRepo(ledger, paths, { path });
    expect(created).toBe(false);
    expect(repo.status).toBe("archived");
  });

  it("reactivates a removed repo whose clone moved to a new path", async () => {
    const id = newId();
    const first = await gitRepo("before-move");
    await writeRepoConfig(first, defaultRepoConfig(id));
    await registerRepo(ledger, paths, { path: first });
    ledger.repos.update(id, { status: "removed" });
    await rm(first, { recursive: true, force: true });

    const moved = await gitRepo("after-move");
    await writeRepoConfig(moved, defaultRepoConfig(id));
    const { repo, created } = await registerRepo(ledger, paths, { path: moved });
    expect(created).toBe(true);
    expect(repo.id).toBe(id);
    expect(repo.path).toBe(moved);
    expect(repo.status).toBe("active");
  });

  it("refuses a path inside agn's own worktrees", async () => {
    const inside = worktreePath(paths, newId(), newId());
    await mkdir(inside, { recursive: true });
    const error = await registerRepo(ledger, paths, { path: inside }).catch(
      (cause: unknown) => cause,
    );
    expect((error as DaemonError).code).toBe("path-inside-worktrees");
  });

  it("refuses a path that does not exist", async () => {
    const error = await registerRepo(ledger, paths, { path: join(workspace, "ghost") }).catch(
      (cause: unknown) => cause,
    );
    expect((error as DaemonError).code).toBe("path-not-found");
  });

  it("refuses a file", async () => {
    const file = join(workspace, "readme.md");
    await writeFile(file, "hi");
    const error = await registerRepo(ledger, paths, { path: file }).catch(
      (cause: unknown) => cause,
    );
    expect((error as DaemonError).code).toBe("path-not-directory");
  });

  it("lets a malformed agnostic.yaml surface as the config error it is", async () => {
    const path = await gitRepo("broken");
    await mkdir(join(path, ".ag"), { recursive: true });
    await writeFile(join(path, ".ag", "agnostic.yaml"), "id: [unclosed\n");
    const error = await registerRepo(ledger, paths, { path }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).code).toBe("ag-file-malformed");
  });
});
