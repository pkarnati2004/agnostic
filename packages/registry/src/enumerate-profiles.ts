import type { EntitlementRow, ModelRow, PlanRow } from "@agnostic/catalog";
import {
  type Billing,
  type Evidence,
  formatProfileId,
  type Plan,
  type Plans,
  type Profile,
  type Route,
} from "@agnostic/core";
import type { HarnessStatus } from "./detect.js";
import type { LocalServer } from "./detect-local-servers.js";
import { planVendor } from "./detect-plan.js";
import { gateways } from "./gateways.js";
import { harnessDefinition } from "./harness-list.js";
import { resolvePlan } from "./resolve-plan.js";

/** The key that lets a harness bill by API when its own login says nothing. */
const NATIVE_API_KEYS: Record<string, string> = {
  "claude-code": "ANTHROPIC_API_KEY",
  codex: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  grok: "XAI_API_KEY",
  kimi: "MOONSHOT_API_KEY",
};

export type EnumerateInput = {
  statuses: HarnessStatus[];
  env: Record<string, string>;
  servers: LocalServer[];
  /** The catalog's tables, passed in as rows: nothing here reads a file or holds state. */
  models: ModelRow[];
  entitlements: EntitlementRow[];
  catalogPlans: PlanRow[];
  /** config.yaml's plans: the fallback for a harness with no plan source, and an override. */
  configPlans: Plans;
};

/**
 * Everything this machine could run right now. A harness that is installed always has a native
 * profile, logged in or not: Claude Code's login lives in the Keychain, where we cannot see it.
 */
export function enumerateProfiles(input: EnumerateInput): Profile[] {
  const profiles: Profile[] = [];
  for (const status of input.statuses) {
    if (status.path === null) {
      continue;
    }
    profiles.push(
      ...nativeProfiles(status, input),
      ...gatewayProfiles(status, input),
      ...localProfiles(status, input.servers),
    );
  }
  return byFirstId(profiles);
}

function nativeProfiles(status: HarnessStatus, input: EnumerateInput): Profile[] {
  const billing = nativeBilling(status, input.env);
  // The default profile comes first: it is the one that works before anyone picks a model.
  const models: Array<string | null> = [null, ...(status.models?.models ?? [])];
  const vendor = billing === "subscription" ? planVendor(status.harness) : null;
  if (vendor === null) {
    return models.map((model) => profile(status, model, "native", billing, "binary"));
  }
  const plan = resolvePlan(status.plan, input.configPlans[vendor], vendor, input.catalogPlans);
  if (plan === null || !plan.known) {
    // Logged in on a subscription, but agn cannot say what it includes, so it says exactly that.
    const unclear: Billing = plan === null ? "subscription" : "unknown";
    return models.map((model) => profile(status, model, "native", unclear, "unknown-plan"));
  }
  return models.flatMap((model) => entitledProfile(status, model, plan.value, input.entitlements));
}

/** A model the plan does not carry is not a profile at all; the default model is always there. */
function entitledProfile(
  status: HarnessStatus,
  model: string | null,
  plan: Plan,
  entitlements: EntitlementRow[],
): Profile[] {
  const access =
    model === null
      ? "included"
      : (entitlements.find(
          (row) => row.harness === status.harness && row.model === model && row.plan === plan,
        )?.access ?? "included");
  if (access === "unavailable") {
    return [];
  }
  const billing: Billing = access === "credits" ? "credits" : "subscription";
  return [profile(status, model, "native", billing, "binary")];
}

function nativeBilling(status: HarnessStatus, env: Record<string, string>): Billing {
  if (status.login === "logged-in") {
    return status.billing;
  }
  const key = NATIVE_API_KEYS[status.harness];
  return key && env[key] ? "api-key" : "unknown";
}

function gatewayProfiles(status: HarnessStatus, input: EnumerateInput): Profile[] {
  const routes = harnessDefinition(status.harness).routes;
  return gateways
    .filter(
      (gateway) =>
        gateway.harnesses.includes(status.harness) &&
        routes.includes(gateway.route) &&
        Boolean(input.env[gateway.envKey]),
    )
    .flatMap((gateway) =>
      input.models
        .filter((row) => row.harness === status.harness && row.route === gateway.route)
        .map((row) => profile(status, row.model, gateway.route, "api-key", "env")),
    );
}

function localProfiles(status: HarnessStatus, servers: LocalServer[]): Profile[] {
  if (!harnessDefinition(status.harness).routes.includes("local")) {
    return [];
  }
  return servers.flatMap((server) =>
    server.models.map((model) => profile(status, model, "local", "local", "port")),
  );
}

function profile(
  status: HarnessStatus,
  model: string | null,
  route: Route,
  billing: Billing,
  evidence: Evidence,
): Profile {
  return {
    id: formatProfileId(status.harness, model, route),
    harness: status.harness,
    model,
    route,
    billing,
    available: true,
    evidence,
    tier: status.tier,
  };
}

/** Two servers can list the same model; the first row wins so ids stay unique. */
function byFirstId(profiles: Profile[]): Profile[] {
  const seen = new Set<string>();
  return profiles.filter((candidate) => {
    if (seen.has(candidate.id)) {
      return false;
    }
    seen.add(candidate.id);
    return true;
  });
}
