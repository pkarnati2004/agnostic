import type { ResumeTaskResponse } from "@agnostic/core";

/** What a resume had to say, which the task's own tab shows above its pane (ADR 014, ADR 031). */
export type ResumeNotice = { taskId: string; notice: string | null };

/**
 * What the page says above the pane after a resume: the same two sentences the CLI prints, in the
 * same order, and nothing at all when the resume took the conversation straight back.
 */
export function resumeNotice(response: ResumeTaskResponse): string | null {
  const said: string[] = [];
  if (response.recreatedFrom !== null) {
    said.push(`Recreated from ${response.recreatedFrom}.`);
  }
  if (response.via === "fresh") {
    const harness = response.task.session?.harness ?? response.task.profileId;
    said.push(`History was not recoverable; started ${harness} fresh with the task context.`);
  }
  return said.length === 0 ? null : said.join(" ");
}
