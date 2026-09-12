import { z } from "zod";
import { TaskClassSchema } from "./task-class.js";

export const EvidenceLevelSchema = z.enum(["strong", "some", "model-level", "none"]);
export type EvidenceLevel = z.infer<typeof EvidenceLevelSchema>;

export const RecommendationLineSchema = z.object({
  profileId: z.string().min(1),
  reason: z.string().min(1),
});
export type RecommendationLine = z.infer<typeof RecommendationLineSchema>;

export const RecommendationSchema = z.object({
  recommended: RecommendationLineSchema.extend({
    evidence: EvidenceLevelSchema,
    sources: z.array(z.string()),
  }),
  alternative: RecommendationLineSchema.nullable(),
  // `enable` tells the user what to turn on before the suggestion applies.
  worthTrying: RecommendationLineSchema.extend({ enable: z.string().min(1) }).nullable(),
  riskNote: z.string().nullable(),
  // What the pick was made for; the recommender groups a repo's outcomes by it.
  taskClass: TaskClassSchema,
});
export type Recommendation = z.infer<typeof RecommendationSchema>;
