import { writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CheckerFixture,
  createCheckerFixture,
  drain,
  published,
} from "./test-catalog-checker.js";

let fixture: CheckerFixture;

beforeEach(async () => {
  fixture = await createCheckerFixture();
});

afterEach(() => fixture.close());

describe("one catalog check", () => {
  it("downloads a newer catalog, reloads the store and says so once", async () => {
    const update = await fixture.create({ fetch: await published() }).update();
    expect(update.outcome).toBe("updated");
    expect(fixture.counts.reloads).toBe(1);
    // No drain: the update path waits for the probe, so the response reflects the fresh detection.
    expect(fixture.counts.probes).toBe(1);
    expect(await fixture.readState()).toMatchObject({ outcome: "updated", remoteVersion: 2 });
  });

  it("records a check that found nothing newer", async () => {
    const update = await fixture.create({ fetch: await published(1) }).update();
    expect(update.outcome).toBe("current");
    expect(fixture.counts.reloads).toBe(0);
    expect(await fixture.readState()).toMatchObject({ outcome: "current", localVersion: 1 });
    // Every check re-probes the harnesses, updated or not (tech lead, 2026-10-01). Nothing in the
    // response waits for it, so the count is read after the turn the un-awaited call needs.
    await drain(1);
    expect(fixture.counts.probes).toBe(1);
  });

  it("records a failure as a warning, never as an error the user sees", async () => {
    const refused: typeof fetch = () => Promise.reject(new Error("connect ECONNREFUSED"));
    await expect(fixture.create({ fetch: refused }).update()).rejects.toThrowError(
      expect.objectContaining({ code: "catalog-fetch-failed" }),
    );
    expect(fixture.warnings).toEqual(["catalog check failed"]);
    expect(await fixture.readState()).toMatchObject({ outcome: "failed", remoteVersion: null });
    await drain(1);
    expect(fixture.counts.probes).toBe(1);
  });

  it("answers a check that found nothing newer without waiting for the probe", async () => {
    let released: () => void = () => undefined;
    const probing = new Promise<void>((resolve) => {
      released = resolve;
    });
    const checker = fixture.create({ fetch: await published(1), probe: () => probing });
    expect((await checker.update()).outcome).toBe("current");
    released();
    await drain(1);
    expect(fixture.counts.probes).toBe(1);
  });

  it("keeps a check's result when the probe it triggers rejects", async () => {
    const update = await fixture
      .create({
        fetch: await published(),
        probe: () => Promise.reject(new Error("harness probe timed out")),
      })
      .update();
    expect(update.outcome).toBe("updated");
    expect(fixture.counts.reloads).toBe(1);
    expect(await fixture.readState()).toMatchObject({ outcome: "updated", remoteVersion: 2 });
    expect(fixture.warnings).toEqual(["re-probe after catalog check failed"]);
  });

  it("keeps a failed check's own error when the probe rejects too", async () => {
    const refused: typeof fetch = () => Promise.reject(new Error("connect ECONNREFUSED"));
    const failing = fixture.create({
      fetch: refused,
      probe: () => Promise.reject(new Error("harness probe timed out")),
    });
    await expect(failing.update()).rejects.toThrowError(
      expect.objectContaining({ code: "catalog-fetch-failed" }),
    );
    await drain(1);
    expect(fixture.warnings).toEqual([
      "catalog check failed",
      "re-probe after catalog check failed",
    ]);
  });

  it("shares one check between the timer and a caller", async () => {
    let calls = 0;
    const counting = await published();
    const checker = fixture.create({
      fetch: (input, init) => {
        calls += 1;
        return counting(input, init);
      },
    });
    const [first, second] = await Promise.all([checker.update(), checker.update()]);
    expect(first).toEqual(second);
    // Two requests, not four: one manifest and one file for the pair of calls.
    expect(calls).toBe(2);
  });

  it("treats an unreadable state file as never having checked", async () => {
    await writeFile(fixture.paths.catalogCheck, "{not json", "utf8");
    const withBadState = fixture.create({ fetch: await published() });
    expect(withBadState.lastCheck()).toBeNull();
    expect(fixture.warnings).toEqual(["catalog check state unreadable"]);
  });
});
