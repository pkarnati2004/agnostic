import { describe, expect, it } from "vitest";
import { runMain } from "../program.js";
import { cli, RECOMMENDATION, run } from "./compare-fixture.js";

describe("agn compare", () => {
  it("posts the named profiles and prints the compare, its tasks and the show line", async () => {
    const test = cli();
    await run(test, ["add the retry budget", "--profiles", "claude-code,codex"]);
    expect(test.calls.started).toEqual([
      {
        repoId: "r1",
        body: { prompt: "add the retry budget", profiles: ["claude-code", "codex"] },
      },
    ]);
    expect(test.out).toEqual([
      "compare cmp1 Add the retry budget",
      "  t1  claude-code:sonnet-4.5:native  /wt/t1",
      "  t2  codex:gpt-5-codex:native  /wt/t1",
      "show: agn compare show cmp1",
    ]);
  });

  it("trims the profile list and drops the empty entries", async () => {
    const test = cli();
    await run(test, ["prompt", "--profiles", " claude-code, codex ,"]);
    expect(test.calls.started[0]?.body.profiles).toEqual(["claude-code", "codex"]);
  });

  it("forwards the title and the intent", async () => {
    const test = cli();
    await run(test, ["prompt", "--profiles", "a,b", "--title", "Retry", "--intent", "debug"]);
    expect(test.calls.started[0]?.body).toEqual({
      prompt: "prompt",
      profiles: ["a", "b"],
      title: "Retry",
      intent: "debug",
    });
  });

  it("asks the recommender for the two profiles when none are named", async () => {
    const test = cli();
    await run(test, ["add the retry budget"]);
    expect(test.calls.recommended).toEqual([
      { repoId: "r1", prompt: "add the retry budget", dryRun: true },
    ]);
    expect(test.calls.started[0]?.body.profiles).toEqual([
      "claude-code:sonnet-4.5:native",
      "codex:gpt-5-codex:native",
    ]);
  });

  it("refuses when the recommender names no alternative", async () => {
    const test = cli({ recommendation: { ...RECOMMENDATION, alternative: null } });
    await expect(run(test, ["prompt"])).rejects.toMatchObject({
      code: "compare-needs-profiles",
      hint: "Pass --profiles <a,b> to name the agents to compare.",
    });
  });

  it("is a usage error with no prompt and no subcommand", async () => {
    const test = cli();
    await expect(run(test, [])).rejects.toMatchObject({
      code: "commander.missingArgument",
      exitCode: 2,
    });
  });

  it("exits 2 with the ruled usage message when nothing follows `compare`", async () => {
    const test = cli();
    const code = await runMain(["node", "agn", "compare"], test.ctx);
    expect(code).toBe(2);
    expect(test.err).toEqual(["error: agn compare needs a prompt, or the show or pick subcommand"]);
    expect(test.out).toEqual([]);
  });

  it("exits 1 with the hint when the recommender names no alternative", async () => {
    const test = cli({ recommendation: { ...RECOMMENDATION, alternative: null } });
    const code = await runMain(["node", "agn", "compare", "prompt"], test.ctx);
    expect(code).toBe(1);
    expect(test.err).toEqual([
      "agn: agn recommends only claude-code:sonnet-4.5:native for this prompt",
      "  hint: Pass --profiles <a,b> to name the agents to compare.",
    ]);
    expect(test.calls.started).toEqual([]);
  });

  it("refuses two identical profile names before any request reaches the daemon", async () => {
    const test = cli();
    await expect(run(test, ["prompt", "--profiles", "a,a"])).rejects.toMatchObject({
      code: "compare-profiles-duplicate",
    });
    expect(test.calls.started).toEqual([]);
    expect(test.calls.recommended).toEqual([]);
  });

  it("prints the started compare as JSON", async () => {
    const test = cli();
    test.ctx.json = true;
    await run(test, ["prompt", "--profiles", "a,b"]);
    expect(JSON.parse(test.out.join("\n"))).toMatchObject({ compareId: "cmp1" });
  });
});
