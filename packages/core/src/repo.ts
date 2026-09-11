import { z } from "zod";
import { IdSchema } from "./id.js";

export const RepoKindSchema = z.enum(["git", "folder"]);
export type RepoKind = z.infer<typeof RepoKindSchema>;

// testCommand, lintCommand and defaultProfileId live in .ag/agnostic.yaml, never in the ledger.
export const RepoSchema = z.object({
  id: IdSchema,
  path: z.string().min(1),
  kind: RepoKindSchema,
  name: z.string().min(1),
  addedAt: z.iso.datetime(),
});
export type Repo = z.infer<typeof RepoSchema>;
