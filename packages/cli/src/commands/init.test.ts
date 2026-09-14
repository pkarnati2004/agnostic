import type { InitRequest, InitWrite } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { createTestContext } from "../test-context.js";
import { initCommand } from "./init.js";

const REPO = { id: "r7k2m4pqrs", name: "app", path: "/work/app", kind: "git" as const };

function cli(writes: InitWrite[]) {
  const asked: { repoId: string; body: InitRequest }[] = [];
  const test = createTestContext({
    client: {
      listRepos: () => Promise.resolve({ repos: [{ ...REPO, addedAt: "", testCommand: null }] }),
      initRepo: (repoId, body) => {
        asked.push({ repoId, body });
        return Promise.resolve({ writes });
      },
    },
    cwd: "/work/app",
  });
  return { ...test, asked };
}

function write(over: Partial<InitWrite> = {}): InitWrite {
  return { file: ".ag/agnostic.yaml", action: "created", source: null, ...over };
}

describe("agn init", () => {
  it("prints one line per entry and what comes next", async () => {
    const test = cli([
      write(),
      write({ file: ".ag/preferences.yaml", action: "kept" }),
      write({ file: ".ag/instructions.md", source: "CLAUDE.md" }),
    ]);
    await initCommand(test.ctx).parseAsync(["--repo", REPO.id], { from: "user" });
    expect(test.out).toEqual([
      "created .ag/agnostic.yaml",
      "kept .ag/preferences.yaml",
      "created .ag/instructions.md (from CLAUDE.md)",
      "next: agn sync",
    ]);
  });

  it("says when it rewrote a file", async () => {
    const test = cli([write({ action: "rewritten" })]);
    await initCommand(test.ctx).parseAsync(["--repo", REPO.id, "--force"], { from: "user" });
    expect(test.out[0]).toBe("rewrote .ag/agnostic.yaml");
    expect(test.asked).toEqual([{ repoId: REPO.id, body: { force: true } }]);
  });

  it("sends the source the user named", async () => {
    const test = cli([write()]);
    await initCommand(test.ctx).parseAsync(["--repo", REPO.id, "--from", "AGENTS.md", "--force"], {
      from: "user",
    });
    expect(test.asked).toEqual([{ repoId: REPO.id, body: { from: "AGENTS.md", force: true } }]);
  });

  it("refuses a --from that is not one of the two files", async () => {
    const test = cli([write()]);
    const command = initCommand(test.ctx)
      .exitOverride()
      .configureOutput({ writeErr: () => undefined });
    await expect(
      command.parseAsync(["--repo", REPO.id, "--from", "README.md"], { from: "user" }),
    ).rejects.toMatchObject({ code: "commander.invalidArgument" });
  });

  it("resolves the repo from the current directory", async () => {
    const test = cli([write()]);
    await initCommand(test.ctx).parseAsync([], { from: "user" });
    expect(test.asked[0]?.repoId).toBe(REPO.id);
  });

  it("prints the daemon's answer verbatim with --json", async () => {
    const test = cli([write()]);
    test.ctx.json = true;
    await initCommand(test.ctx).parseAsync(["--repo", REPO.id], { from: "user" });
    expect(JSON.parse(test.out.join("\n"))).toEqual({ writes: [write()] });
  });
});
