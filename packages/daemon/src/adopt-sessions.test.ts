import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { errorOf, type FakeSessions, fakeSessions, seedAdopted } from "./test-adopt.js";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";

let daemon: TestDaemon;
let agents: FakeSessions;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
  agents = fakeSessions(daemon);
});

afterEach(async () => {
  await agents.killAll();
  await daemon.close();
});

describe("GET /repos/:id/sessions", () => {
  it("lists the agents running under a path, in tmux or not, and drops one-shots", async () => {
    const repo = await daemon.addRepo();
    const bare = await agents.outsideTmux(join(repo.path, "sub"));
    await agents.outsideTmux(join(repo.path, "sub"), ["-p", "one shot"]);
    await agents.underTmux(join(repo.path, "other"), "manual");

    const sessions = await agents.waitForCount(repo, repo.path, 2);
    const outside = sessions.find((session) => session.pid === bare);
    const inside = sessions.find((session) => session.tmux !== null);
    expect(outside?.harness).toBe("claude-code");
    expect(outside?.tmux).toBeNull();
    expect(inside?.tmux?.session).toBe("manual");
    expect(inside?.tmux?.socket).toBe(daemon.launch?.socketName);
  });

  it("lists the candidate that is not adopted yet and drops the one that is", async () => {
    const repo = await daemon.addRepo();
    const taken = await agents.outsideTmux(join(repo.path, "sub"));
    const free = await agents.outsideTmux(join(repo.path, "other"));
    await agents.waitForCount(repo, repo.path, 2);
    const adopt = await daemon.request(`/repos/${repo.id}/adopt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: repo.path, pid: taken }),
    });
    expect(adopt.status).toBe(201);

    // One of the two is a task now; the list is still an answer, not the already-adopted refusal.
    const sessions = await agents.waitForCount(repo, repo.path, 1);
    expect(sessions.map((session) => session.pid)).toEqual([free]);
  });

  it("names the task that owns the path when detection cannot see its process", async () => {
    const repo = await daemon.addRepo();
    // A live process detection never reports as a harness, the way a real one goes missing when
    // the process table or `lsof` answers too late to matter.
    const cwd = join(repo.path, "sub");
    await mkdir(cwd, { recursive: true });
    const task = seedAdopted(daemon, repo, process.pid, cwd);

    const response = await agents.list(repo, repo.path);

    expect(response.status).toBe(409);
    const body = await errorOf(response);
    expect(body.error.code).toBe("adopt-already-adopted");
    expect(body.error.message).toContain(task.id);
  });

  it("refuses a path that is not inside the repo", async () => {
    const repo = await daemon.addRepo();
    const response = await daemon.request(
      `/repos/${repo.id}/sessions?path=${encodeURIComponent(daemon.paths.home)}`,
    );
    expect(response.status).toBe(400);
    expect((await errorOf(response)).error.code).toBe("path-outside-repo");
  });
});
