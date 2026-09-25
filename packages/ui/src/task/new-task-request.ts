import type {
  Profile,
  Recommendation,
  RecommendRequest,
  RunTaskRequest,
  SpecRequest,
  TaskClass,
} from "@agnostic/core";
import type { IntentOption } from "./intent-options";

export type NewTaskForm = {
  repoId: string;
  prompt: string;
  intent: IntentOption;
  /** What the Profile select shows: the pick until the user picks for themselves. */
  profileId: string | null;
  /** The approved spec: empty until the spec step fills it in or the user writes one. */
  title: string;
  spec: string;
  acceptance: string;
  /** This run's `--ignore-budget`: ticked in the note under the select, and gone with the form. */
  ignoreBudget: boolean;
};

/**
 * Null while there is nothing to ask about; the daemon rejects an empty prompt anyway. The card
 * asks again on every pause in the typing, so the call is a dry run: the run itself records the
 * recommendation it started on, and that is the one row the task should have.
 */
export function recommendRequest(form: NewTaskForm): RecommendRequest | null {
  const prompt = form.prompt.trim();
  if (prompt === "" || form.repoId === "") {
    return null;
  }
  return {
    repoId: form.repoId,
    prompt,
    dryRun: true,
    ...(form.intent === "automatic" ? {} : { intent: form.intent }),
  };
}

/** The one-liner a spec is written from; the daemon reads the repo state for itself. */
export function specRequest(form: NewTaskForm): SpecRequest | null {
  const prompt = form.prompt.trim();
  if (prompt === "" || form.repoId === "") {
    return null;
  }
  return { prompt, ...(form.intent === "automatic" ? {} : { intent: form.intent }) };
}

/**
 * The run the tab would make. `profile` is always sent, even when it equals the pick, so the
 * task starts on what the user saw rather than on whatever the repo's default resolves to. The
 * prompt stays the one-liner whether or not a spec came with it (ADR 028).
 */
export function runRequest(form: NewTaskForm): RunTaskRequest | null {
  const prompt = form.prompt.trim();
  if (prompt === "" || form.profileId === null) {
    return null;
  }
  // A field the user cleared is left out: the daemon rejects an empty string for any of the three.
  const title = form.title.trim();
  const spec = form.spec.trim();
  const acceptance = form.acceptance.trim();
  return {
    prompt,
    profile: form.profileId,
    ...(form.intent === "automatic" ? {} : { intent: form.intent }),
    ...(title === "" ? {} : { title }),
    ...(spec === "" ? {} : { spec }),
    ...(acceptance === "" ? {} : { acceptance }),
    ...(form.ignoreBudget ? { ignoreBudget: true } : {}),
  };
}

/**
 * What the intent chip reads. Left on "auto" it names what the classifier made of the prompt, so the
 * reading is on the chip that would change it; set by hand it names only what the user chose.
 */
export function intentLabel(intent: IntentOption, taskClass: TaskClass | null): string {
  if (intent !== "automatic") {
    return `Intent: ${intent}`;
  }
  return taskClass === null ? "Intent: auto" : `Intent: auto (reads as ${taskClass.intent})`;
}

/** The select follows the pick until the user chooses for themselves, and then stops. */
export function followRecommendation(
  current: string | null,
  touched: boolean,
  recommendation: Recommendation | null,
  profiles: Profile[],
): string | null {
  if (touched || recommendation === null) {
    return current;
  }
  const picked = recommendation.recommended.profileId;
  return profiles.some((profile) => profile.id === picked) ? picked : current;
}
