import { z } from "zod";
import { IdSchema } from "./id.js";

export const RepoKindSchema = z.enum(["git", "folder"]);
export type RepoKind = z.infer<typeof RepoKindSchema>;

/**
 * Archived means closed: the repo keeps its history and leaves the default listings (ADR 032).
 * Removed means hidden for good, with every row kept, until `agn add` of its path (ADR 034).
 */
export const RepoStatusSchema = z.enum(["active", "archived", "removed"]);
export type RepoStatus = z.infer<typeof RepoStatusSchema>;

// testCommand, lintCommand and defaultProfileId live in .ag/agnostic.yaml, never in the ledger.
export const RepoSchema = z.object({
  id: IdSchema,
  path: z.string().min(1),
  kind: RepoKindSchema,
  name: z.string().min(1),
  addedAt: z.iso.datetime(),
  // The default is what lets an event written before the status column replay.
  status: RepoStatusSchema.default("active"),
});
export type Repo = z.infer<typeof RepoSchema>;
