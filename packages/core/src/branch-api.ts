import { z } from "zod";
import type { Task } from "./task.js";

export const CreatePrRequestSchema = z.strictObject({
  title: z.string().min(1).max(256).optional(),
});
export type CreatePrRequest = z.infer<typeof CreatePrRequestSchema>;

/** The answer to `POST /tasks/:id/pr`: where the pull request is, and the description for it. */
export type CreatePrResponse = {
  task: Task;
  url: string;
  /** The PR description agn composed: the note's Spec, Acceptance and latest Handoff sections. */
  body: string;
  /** `gh` opened the PR; `compare` means the URL is GitHub's compare page and nobody opened it. */
  via: "gh" | "compare";
  /** True when this call moved the remote branch; false when it was already up to date. */
  pushed: boolean;
  /** What the PR targets: the repo's base ref, or the parent task's branch for a stacked task. */
  base: string;
  branch: string;
};
