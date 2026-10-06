import { expect, it } from "vitest";
import { createClient, type WorkspaceClient } from "./client";
import { ApiError } from "./error";

/** A daemon that answers every call the same way: what matters here is the refusal, not the path. */
function answering(answer: () => Response): WorkspaceClient {
  return createClient({ token: "tok", fetch: () => Promise.resolve(answer()) });
}

function refusal(body: unknown, status: number): () => Response {
  return () => Response.json(body, { status });
}

it("turns the daemon's error body into an ApiError", async () => {
  const client = answering(
    refusal(
      { error: { code: "session-not-running", message: "nothing is running", hint: "Resume it." } },
      409,
    ),
  );
  const failure = await client.stopTask("t1").catch((cause: unknown) => cause);
  expect(failure).toBeInstanceOf(ApiError);
  expect(failure).toMatchObject({
    code: "session-not-running",
    message: "nothing is running",
    hint: "Resume it.",
    status: 409,
  });
});

it("maps a refused open to the daemon's own message and hint", async () => {
  const client = answering(
    refusal(
      {
        error: { code: "editor-failed", message: "zed did not start", hint: "Run `agn open t1`." },
      },
      409,
    ),
  );
  const failure = await client.openTask("t1", {}).catch((cause: unknown) => cause);
  expect(failure).toBeInstanceOf(ApiError);
  expect(failure).toMatchObject({
    code: "editor-failed",
    status: 409,
    hint: "Run `agn open t1`.",
  });
});

it("turns a refused run into an ApiError", async () => {
  const client = answering(
    refusal(
      { error: { code: "folder-busy", message: "that folder is in use", hint: "Stop it first." } },
      409,
    ),
  );
  const failure = await client
    .runTask("r1", { prompt: "add a retry budget" })
    .catch((cause: unknown) => cause);
  expect(failure).toMatchObject({ code: "folder-busy", hint: "Stop it first.", status: 409 });
});

it("reports a usage scan the daemon could not finish", async () => {
  const client = answering(
    refusal(
      { error: { code: "usage-scan-failed", message: "a transcript could not be read" } },
      500,
    ),
  );
  const failure = await client.usage().catch((cause: unknown) => cause);
  expect(failure).toBeInstanceOf(ApiError);
  expect(failure).toMatchObject({ code: "usage-scan-failed", status: 500 });
});

it("turns a 401 body into an unauthorized ApiError", async () => {
  const client = answering(
    refusal({ error: { code: "unauthorized", message: "missing or bad token" } }, 401),
  );
  const failure = await client.listRepos().catch((cause: unknown) => cause);
  expect(failure).toMatchObject({ code: "unauthorized", status: 401 });
});

it("turns a 403 body into an origin-forbidden ApiError", async () => {
  const client = answering(
    refusal(
      { error: { code: "origin-forbidden", message: "that origin is not this daemon" } },
      403,
    ),
  );
  const failure = await client.listTasks().catch((cause: unknown) => cause);
  expect(failure).toMatchObject({ code: "origin-forbidden", status: 403 });
});

it("reports a body that is not the daemon's error shape", async () => {
  const client = answering(() => new Response("<html>bad gateway</html>", { status: 500 }));
  const failure = await client.listTasks().catch((cause: unknown) => cause);
  expect(failure).toMatchObject({ code: "daemon-response-invalid", status: 500 });
});

it("reports a daemon that is not answering", async () => {
  const client = createClient({
    token: "tok",
    fetch: () => Promise.reject(new TypeError("Failed to fetch")),
  });
  const failure = await client.listRepos().catch((cause: unknown) => cause);
  expect(failure).toMatchObject({ code: "daemon-unreachable", status: null });
  expect((failure as ApiError).hint).toBe("Run `agn daemon start`.");
});

it("passes an aborted fetch back as it was thrown", async () => {
  const abort = new DOMException("aborted", "AbortError");
  const client = createClient({ token: "tok", fetch: () => Promise.reject(abort) });
  const failure = await client
    .recommend({ repoId: "r1", prompt: "x" }, new AbortController().signal)
    .catch((cause: unknown) => cause);
  expect(failure).toBe(abort);
});
