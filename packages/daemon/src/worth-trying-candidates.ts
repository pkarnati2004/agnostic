import { type Catalog, entitlement, knowsPlan } from "@agnostic/catalog";
import { formatProfileId, type HarnessId, type Plans, type Profile } from "@agnostic/core";
import type { Candidate } from "@agnostic/recommender";
import { gateways, installCommand, planVendor } from "@agnostic/registry";

/**
 * The models this machine could run but does not, each with the one step that would enable it:
 * install the agent, export a provider key, or move up a plan. A candidate agn cannot name a step
 * for is not a candidate at all - "worth trying" without a way to try it is noise.
 */
export function worthTryingCandidates(
  catalog: Catalog,
  profiles: Profile[],
  installed: Set<HarnessId>,
  plans: Plans,
): Candidate[] {
  const available = new Set(profiles.filter((profile) => profile.available).map(({ id }) => id));
  const candidates: Candidate[] = [];
  for (const row of catalog.models) {
    const id = formatProfileId(row.harness, row.model, row.route);
    // Nothing to enable on the local route, and a legacy model is never what agn suggests.
    if (row.legacy || row.route === "local" || available.has(id)) {
      continue;
    }
    const step = enablingStep(catalog, row.harness, row.model, row.route, installed, plans);
    if (step === null) {
      continue;
    }
    candidates.push({
      profile: {
        id,
        harness: row.harness,
        model: row.model,
        route: row.route,
        billing: step.billing,
        available: false,
        evidence: step.evidence,
        tier: 1,
      },
      enable: step.enable,
    });
  }
  return candidates;
}

type Step = { enable: string; billing: Profile["billing"]; evidence: Profile["evidence"] };

function enablingStep(
  catalog: Catalog,
  harness: HarnessId,
  model: string,
  route: Profile["route"],
  installed: Set<HarnessId>,
  plans: Plans,
): Step | null {
  if (!installed.has(harness)) {
    const command = installCommand(harness);
    return command === null ? null : { enable: command, billing: "unknown", evidence: "binary" };
  }
  const gateway = gateways.find((candidate) => candidate.route === route);
  if (gateway !== undefined) {
    return {
      enable: `export ${gateway.envKey}=<your key>`,
      billing: "api-key",
      evidence: "env",
    };
  }
  return planStep(catalog, harness, model, plans);
}

/** A model the agent lists but the user's plan does not include: the step is the vendor's, not ours. */
function planStep(catalog: Catalog, harness: HarnessId, model: string, plans: Plans): Step | null {
  const vendor = planVendor(harness);
  const plan = vendor === null ? null : (plans[vendor] ?? null);
  if (vendor === null || plan === null || !knowsPlan(catalog, vendor, plan)) {
    return null;
  }
  const access = entitlement(catalog, harness, model, plan);
  if (access !== "credits" && access !== "unavailable") {
    return null;
  }
  return {
    enable: `upgrade your ${vendor} plan: ${model} is ${access} on ${plan}`,
    billing: access === "credits" ? "credits" : "unknown",
    evidence: "unknown-plan",
  };
}
