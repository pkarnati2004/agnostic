import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { errorOf, type FakeSessions, fakeSessions } from "./test-adopt.js";
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

  it("refuses a path that is not inside the repo", async () => {
    const repo = await daemon.addRepo();
    const response = await daemon.request(
      `/repos/${repo.id}/sessions?path=${encodeURIComponent(daemon.paths.home)}`,
    );
    expect(response.status).toBe(400);
    expect((await errorOf(response)).error.code).toBe("path-outside-repo");
  });
});
