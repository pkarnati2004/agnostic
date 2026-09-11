import { z } from "zod";

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
});
export type Recommendation = z.infer<typeof RecommendationSchema>;
