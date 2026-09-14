import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ApiErrorBody, SpecResponse, Task } from "@agnostic/core";
import { afterEach, describe, expect, it } from "vitest";
import type { Detection } from "../detection-cache.js";
import { SPEC_WRITER_TASK_HEADER } from "../spec-writer.js";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";
import { fixtureDetection } from "../test-detection.js";

let daemon: TestDaemon;
let logDir: string | null = null;

afterEach(async () => {
  await daemon.close();
  if (logDir !== null) {
    await rm(logDir, { recursive: true, force: true });
    logDir = null;
  }
});

const BIN = fileURLToPath(new URL("../../../../tests/fixtures/bin", import.meta.url));

/** The fixture harness answers on stdout; detection points the daemon at the one this test wants. */
function detection(dir: string, binary = "claude"): Detection {
  const found = fixtureDetection(["fable"], binary === "codex" ? ["codex"] : ["claude-code"]);
  return {
    ...found,
    harnesses: found.harnesses.map((row) => ({ ...row, path: join(BIN, dir, binary) })),
    profiles: found.profiles.map((row) =>
      binary === "codex"
        ? {
            ...row,
            id: "codex:gpt-6-astra:native",
            harness: "codex" as const,
            model: "gpt-6-astra",
          }
        : row,
    ),
  };
}

async function start(dir: string, opts: { binary?: string; specLog?: string } = {}) {
  daemon = await createTestDaemon({
    detect: () => Promise.resolve(detection(dir, opts.binary)),
    // The fixture harnesses are shell scripts, so they need a PATH with a shell's tools on it.
    env: {
      PATH: "/usr/bin:/bin",
      ...(opts.specLog === undefined ? {} : { SPEC_LOG: opts.specLog }),
    },
    ...(dir === "spec-hangs" ? { specTimeoutMs: 200 } : {}),
  });
  return await daemon.addRepo();
}

function ask(repoId: string, body: Record<string, unknown>): Promise<Response> {
  return daemon.request(`/repos/${repoId}/spec`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function seedDone(repoId: string, title: string): Task {
  const now = new Date().toISOString();
  return daemon.ledger.tasks.insert({
    id: "zyxwvutsrq",
    repoId,
    title,
    prompt: "an earlier prompt",
    profileId: "claude-code:default:native",
    worktreePath: null,
    branch: "agn/earlier",
    status: "done",
    origin: "agn",
    baseCommit: null,
    createdAt: now,
    updatedAt: now,
  });
}

describe("POST /repos/:id/spec", () => {
  it("answers with the parsed spec and who wrote it", async () => {
    const repo = await start("spec");
    const response = await ask(repo.id, { prompt: "add a verbose flag" });
    expect(response.status).toBe(200);
    expect((await response.json()) as SpecResponse).toEqual({
      title: "Add a verbose flag",
      spec: "Add `--verbose` to the CLI in `src/main.ts` and print one line per step.",
      acceptance:
        "- [ ] `agn --verbose` prints a line per step\n- [ ] the existing output is unchanged without the flag",
      profileId: "claude-code:fable:native",
      model: "fable",
    });
  });

  it("runs the harness in the repo, on the prompt, under the spec-writer task id", async () => {
    logDir = await mkdtemp(join(tmpdir(), "agn-spec-log-"));
    const logFile = join(logDir, "spec.txt");
    const repo = await start("spec", { specLog: logFile });
    seedDone(repo.id, "ship the parser");
    expect((await ask(repo.id, { prompt: "add a verbose flag", intent: "implement" })).status).toBe(
      200,
    );
    const log = await readFile(logFile, "utf8");
    expect(log).toContain(`PWD=${repo.path}`);
    expect(log).toContain(`AGN_TASK_ID=${SPEC_WRITER_TASK_HEADER}`);
    expect(log).toContain("Task: add a verbose flag");
    expect(log).toContain("Intent: implement");
    expect(log).toContain("## Repo state");
    expect(log).toContain("ship the parser");
    expect(log).toContain("# <a title of at most 80 characters>");
    expect(log).toContain("## Spec");
    expect(log).toContain("## Acceptance");
    expect(log).toContain("ARGS=-p --output-format text --permission-mode plan --model fable");
  });

  it("keeps the prompt out of the daemon log and writes nothing to the ledger", async () => {
    const repo = await start("spec");
    const before = daemon.ledger.events.latestId();
    await ask(repo.id, { prompt: "a prompt that must never reach the log" });
    expect(daemon.ledger.events.latestId()).toBe(before);
    expect(await daemon.readLog()).not.toContain("must never reach the log");
    expect(await daemon.readLog()).toContain("spec written");
  });

  it("reports a harness that refuses as a 502 with its exit code", async () => {
    const repo = await start("spec-fails", { binary: "codex" });
    const response = await ask(repo.id, { prompt: "add a verbose flag" });
    expect(response.status).toBe(502);
    const body = (await response.json()) as ApiErrorBody;
    expect(body.error.code).toBe("spec-writer-failed");
    expect(body.error.message).toBe("Codex CLI exited with code 3");
    expect(body.error.hint).toContain(repo.path);
    // The stderr the harness printed belongs in the process log and nowhere else.
    expect(body.error.message).not.toContain("not logged in");
  });

  it("gives up on a harness that never answers", async () => {
    const repo = await start("spec-hangs");
    const response = await ask(repo.id, { prompt: "add a verbose flag" });
    expect(response.status).toBe(502);
    expect(((await response.json()) as ApiErrorBody).error.message).toContain("timed out");
  });

  it("answers 409 when nothing on this machine can write a spec", async () => {
    daemon = await createTestDaemon();
    const repo = await daemon.addRepo();
    const response = await ask(repo.id, { prompt: "add a verbose flag" });
    expect(response.status).toBe(409);
    expect(((await response.json()) as ApiErrorBody).error.code).toBe("spec-writer-unavailable");
  });

  it("answers 409 when spec_writer names a local profile", async () => {
    const found = detection("spec");
    daemon = await createTestDaemon({
      detect: () =>
        Promise.resolve({
          ...found,
          profiles: found.profiles.map((row) => ({
            ...row,
            id: `${row.harness}:${row.model ?? "default"}:local`,
            route: "local" as const,
          })),
        }),
    });
    const repo = await daemon.addRepo();
    await writeFile(daemon.paths.config, "spec_writer: claude-code:fable:local\n");
    const response = await ask(repo.id, { prompt: "add a verbose flag" });
    expect(response.status).toBe(409);
    expect(((await response.json()) as ApiErrorBody).error.code).toBe("spec-writer-unavailable");
  });

  it("refuses a body with no prompt and a repo it does not know", async () => {
    const repo = await start("spec");
    expect((await ask(repo.id, {})).status).toBe(400);
    expect((await ask(repo.id, { prompt: "go", repoId: "x" })).status).toBe(400);
    expect((await ask("nosuchrepo", { prompt: "go" })).status).toBe(404);
  });

  it("refuses an empty prompt, an unknown field and an intent that is not one", async () => {
    const repo = await start("spec");
    expect((await ask(repo.id, { prompt: "" })).status).toBe(400);
    expect((await ask(repo.id, { prompt: "go", extra: true })).status).toBe(400);
    expect((await ask(repo.id, { prompt: "go", intent: "not-an-intent" })).status).toBe(400);
  });
});
