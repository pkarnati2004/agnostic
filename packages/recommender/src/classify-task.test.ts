import { defaultPreferences, type RiskRule } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { classifyTask, KEYWORD_TABLES, type KeywordTables, withIntent } from "./classify-task.js";

const rules = defaultPreferences().riskRules;

function classify(prompt: string, over: RiskRule[] = rules) {
  return classifyTask(prompt, over);
}

describe("classifyTask", () => {
  it("reads the intent out of the prompt, first match in priority order", () => {
    expect(classify("fix the flaky auth test in petal").intent).toBe("debug");
    expect(classify("add a --verbose flag to the CLI").intent).toBe("implement");
    expect(classify("refactor the payments module into two files").intent).toBe("refactor");
    expect(classify("why does the build take 4 minutes").intent).toBe("research");
    expect(classify("make the settings page responsive").intent).toBe("ui");
    expect(classify("review the diff on the release branch").intent).toBe("review");
  });

  it("answers general when no rule matched, rather than guessing", () => {
    const taskClass = classify("do the thing");
    expect(taskClass.intent).toBe("general");
    expect(taskClass.automaticIntent).toBeNull();
  });

  it("sizes a short prompt small and one with a breadth word large", () => {
    expect(classify("fix the flaky auth test in petal").scope).toBe("small");
    expect(classify("rename the client across every package").scope).toBe("large");
    expect(
      classify(
        "add a --verbose flag to the CLI and thread it through the daemon client so the run command can opt into it",
      ).scope,
    ).toBe("medium");
  });

  it("names the risk areas the risk rules matched, in file order", () => {
    expect(classify("fix the flaky auth test in petal").risk).toEqual(["auth"]);
    expect(classify("refactor the payments module into two files").risk).toEqual(["payments"]);
    expect(classify("migrate the db schema").risk).toEqual(["db"]);
    expect(classify("rewrite the login form and the stripe webhook").risk).toEqual([
      "auth",
      "payments",
    ]);
    expect(classify("add a --verbose flag to the CLI").risk).toEqual([]);
  });

  it("matches a keyword at a word start, whatever the case", () => {
    expect(classify("Fix the Authentication middleware").risk).toEqual(["auth"]);
    // "oauth" is a keyword of its own; it is not a match for "auth".
    expect(classify("fix the oauth callback").risk).toEqual(["auth"]);
    expect(classify("fix the flooauth callback").risk).toEqual([]);
  });

  it("lets a repo replace the risk rules with its own", () => {
    const own: RiskRule[] = [
      { area: "protocol", keywords: ["wire", "frame"], review: "none", minEvidence: "some" },
    ];
    expect(classify("fix the wire format", own).risk).toEqual(["protocol"]);
    // The default areas are gone, not merged.
    expect(classify("fix the auth session", own).risk).toEqual([]);
  });

  it("sees a task that needs a browser", () => {
    expect(classify("check the login flow in the browser with playwright").needsBrowser).toBe(true);
    expect(classify("fix the flaky auth test in petal").needsBrowser).toBe(false);
  });
});

describe("the keyword tables", () => {
  it("ships the intents in the priority order the rules are read in", () => {
    expect(KEYWORD_TABLES.intents.map((row) => row.intent)).toEqual([
      "debug",
      "review",
      "refactor",
      "research",
      "ui",
      "implement",
    ]);
  });

  it("classifies against whichever tables it is handed", () => {
    const tables: KeywordTables = {
      intents: [{ intent: "ui", keywords: ["wire"] }],
      breadth: ["sweeping"],
      browser: ["firefox"],
    };
    expect(classifyTask("wire up the sweeping firefox check", [], tables)).toEqual({
      intent: "ui",
      scope: "large",
      risk: [],
      needsBrowser: true,
      automaticIntent: null,
    });
  });
});

describe("withIntent", () => {
  it("keeps the intent the rules found beside the one the user gave", () => {
    const overridden = withIntent(classify("why does the build take 4 minutes"), "debug");
    expect(overridden.intent).toBe("debug");
    expect(overridden.automaticIntent).toBe("research");
  });

  it("records no override when the user named what the rules already said", () => {
    const same = withIntent(classify("fix the flaky auth test"), "debug");
    expect(same.automaticIntent).toBeNull();
  });
});
