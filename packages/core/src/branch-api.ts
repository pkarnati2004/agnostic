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

export type UpdateMode = "rebase" | "merge";

/** The answer to `POST /tasks/:id/update`: what the agent was asked to do, and how it was asked. */
export type UpdateTaskResponse = {
  task: Task;
  /** rebase when the branch has no upstream (never published); merge when it has one. */
  mode: UpdateMode;
  /** live: typed into the running session; native | fresh: the resume tree ran with it (ADR 014). */
  via: "live" | "native" | "fresh";
  base: string;
  prompt: string;
};
