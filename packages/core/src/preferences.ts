import { z } from "zod";
import { agPaths } from "./ag-layout.js";
import { EvidenceLevelSchema } from "./recommendation.js";
import { readYamlFile, writeYamlFile } from "./yaml-file.js";

const HEADER = "optimize: quality | balanced | cost | speed";

export const OptimizePresetSchema = z.enum(["quality", "balanced", "cost", "speed"]);
export type OptimizePreset = z.infer<typeof OptimizePresetSchema>;

export const ReviewPolicySchema = z.enum(["independent", "none"]);
export type ReviewPolicy = z.infer<typeof ReviewPolicySchema>;

export const RiskRuleSchema = z
  .strictObject({
    area: z.string().min(1),
    keywords: z.array(z.string().min(1)).min(1),
    review: ReviewPolicySchema,
    min_evidence: EvidenceLevelSchema,
  })
  .transform((rule) => ({
    area: rule.area,
    keywords: rule.keywords,
    review: rule.review,
    minEvidence: rule.min_evidence,
  }));
export type RiskRule = z.infer<typeof RiskRuleSchema>;

export const PreferencesSchema = z
  .strictObject({
    optimize: OptimizePresetSchema.default("balanced"),
    subscriptions_only: z.boolean().default(false),
    allow_local: z.boolean().default(true),
    risk_rules: z.array(RiskRuleSchema).optional(),
  })
  .transform((file) => ({
    optimize: file.optimize,
    subscriptionsOnly: file.subscriptions_only,
    allowLocal: file.allow_local,
    // A list in the file replaces the built-in rules; merging by area would hide a deleted rule.
    riskRules: file.risk_rules ?? defaultRiskRules(),
  }));
export type Preferences = z.infer<typeof PreferencesSchema>;

/** The areas where a second opinion is worth the tokens, in the words the recommender matches. */
function defaultRiskRules(): RiskRule[] {
  const areas: Record<string, string[]> = {
    auth: ["auth", "login", "session", "oauth", "password", "credential"],
    db: ["database", "migration", "schema", "sql"],
    payments: ["payment", "billing", "stripe", "invoice", "checkout"],
    infra: ["deploy", "terraform", "kubernetes", "docker", "dockerfile"],
  };
  return Object.entries(areas).map(([area, keywords]) => ({
    area,
    keywords,
    review: "independent",
    minEvidence: "strong",
  }));
}

export function defaultPreferences(): Preferences {
  return {
    optimize: "balanced",
    subscriptionsOnly: false,
    allowLocal: true,
    riskRules: defaultRiskRules(),
  };
}

/** No file means the defaults; a file that is present and wrong is an error, never a default. */
export async function readPreferences(repoPath: string): Promise<Preferences> {
  const file = agPaths(repoPath).preferencesYaml;
  const hint = `Fix ${file} or delete it to use the defaults.`;
  return (await readYamlFile(file, PreferencesSchema, hint)) ?? defaultPreferences();
}

export function writePreferences(repoPath: string, prefs: Preferences): Promise<void> {
  return writeYamlFile(
    agPaths(repoPath).preferencesYaml,
    {
      optimize: prefs.optimize,
      subscriptions_only: prefs.subscriptionsOnly,
      allow_local: prefs.allowLocal,
      risk_rules: prefs.riskRules.map((rule) => ({
        area: rule.area,
        keywords: rule.keywords,
        review: rule.review,
        min_evidence: rule.minEvidence,
      })),
    },
    HEADER,
  );
}
