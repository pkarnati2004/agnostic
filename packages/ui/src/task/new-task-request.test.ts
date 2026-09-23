import {
  type Profile,
  type Recommendation,
  RecommendRequestSchema,
  RunTaskRequestSchema,
} from "@agnostic/core";
import { describe, expect, it } from "vitest";
import {
  followRecommendation,
  type NewTaskForm,
  recommendRequest,
  runRequest,
  specRequest,
} from "./new-task-request";

const FORM: NewTaskForm = {
  repoId: "r1",
  prompt: "  add a retry budget  ",
  intent: "automatic",
  profileId: "claude-code:opus:native",
  title: "",
  spec: "",
  acceptance: "",
  ignoreBudget: false,
};

function profile(id: string): Profile {
  return {
    id,
    harness: "claude-code",
    model: "opus",
    route: "native",
    billing: "subscription",
    available: true,
    evidence: "binary",
    tier: 1,
  };
}

describe("recommendRequest", () => {
  it("asks nothing about an empty prompt", () => {
    expect(recommendRequest({ ...FORM, prompt: "  " })).toBeNull();
  });

  it("sends the trimmed prompt and no intent when the rules decide", () => {
    const request = recommendRequest(FORM);
    expect(request).toEqual({ repoId: "r1", prompt: "add a retry budget", dryRun: true });
    expect(RecommendRequestSchema.safeParse(request).success).toBe(true);
  });

  it("asks as a dry run, so a pause in the typing records nothing", () => {
    expect(recommendRequest(FORM)?.dryRun).toBe(true);
  });

  it("sends the intent the user chose", () => {
    expect(recommendRequest({ ...FORM, intent: "debug" })?.intent).toBe("debug");
  });
});

describe("runRequest", () => {
  it("waits for a profile", () => {
    expect(runRequest({ ...FORM, profileId: null })).toBeNull();
    expect(runRequest({ ...FORM, prompt: " " })).toBeNull();
  });

  it("sends the prompt, the profile the user saw, and the intent", () => {
    const request = runRequest({ ...FORM, intent: "debug" });
    expect(request).toEqual({
      prompt: "add a retry budget",
      profile: "claude-code:opus:native",
      intent: "debug",
    });
    expect(RunTaskRequestSchema.safeParse(request).success).toBe(true);
  });

  it("sends nothing the daemon does not take", () => {
    expect(RunTaskRequestSchema.safeParse(runRequest(FORM)).success).toBe(true);
  });

  it("asks to run past the budget only when the note's checkbox is ticked", () => {
    expect(runRequest(FORM)?.ignoreBudget).toBeUndefined();
    const request = runRequest({ ...FORM, ignoreBudget: true });
    expect(request?.ignoreBudget).toBe(true);
    expect(RunTaskRequestSchema.safeParse(request).success).toBe(true);
  });

  it("sends the approved spec, trimmed, and leaves out a field the user cleared", () => {
    const request = runRequest({
      ...FORM,
      title: "  Add a retry budget  ",
      spec: "  Change the client.  ",
      acceptance: "   ",
    });
    expect(request).toEqual({
      prompt: "add a retry budget",
      profile: "claude-code:opus:native",
      title: "Add a retry budget",
      spec: "Change the client.",
    });
    expect(RunTaskRequestSchema.safeParse(request).success).toBe(true);
  });

  it("sends no spec fields when the dialog has none", () => {
    expect(runRequest(FORM)).toEqual({
      prompt: "add a retry budget",
      profile: "claude-code:opus:native",
    });
  });
});

describe("specRequest", () => {
  it("waits for a prompt and a repo", () => {
    expect(specRequest({ ...FORM, prompt: " " })).toBeNull();
    expect(specRequest({ ...FORM, repoId: "" })).toBeNull();
  });

  it("sends the trimmed one-liner, with the intent only when the user chose one", () => {
    expect(specRequest(FORM)).toEqual({ prompt: "add a retry budget" });
    expect(specRequest({ ...FORM, intent: "debug" })).toEqual({
      prompt: "add a retry budget",
      intent: "debug",
    });
  });
});

describe("followRecommendation", () => {
  const recommendation = {
    recommended: { profileId: "codex:gpt-5:native", reason: "why", evidence: "some", sources: [] },
    alternative: null,
    worthTrying: null,
    riskNote: null,
    taskClass: {
      intent: "debug",
      scope: "small",
      risk: [],
      needsBrowser: false,
      automaticIntent: null,
    },
  } satisfies Recommendation;

  it("takes the pick while the user has not chosen", () => {
    const profiles = [profile("claude-code:opus:native"), profile("codex:gpt-5:native")];
    expect(followRecommendation("claude-code:opus:native", false, recommendation, profiles)).toBe(
      "codex:gpt-5:native",
    );
  });

  it("keeps what is selected when the pick is not a profile this machine has", () => {
    const profiles = [profile("claude-code:opus:native")];
    expect(followRecommendation("claude-code:opus:native", false, recommendation, profiles)).toBe(
      "claude-code:opus:native",
    );
  });

  it("leaves a profile the user chose alone", () => {
    const profiles = [profile("claude-code:opus:native"), profile("codex:gpt-5:native")];
    expect(followRecommendation("claude-code:opus:native", true, recommendation, profiles)).toBe(
      "claude-code:opus:native",
    );
    expect(followRecommendation(null, false, null, profiles)).toBeNull();
  });
});
