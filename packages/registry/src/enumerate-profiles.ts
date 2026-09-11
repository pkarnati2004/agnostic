import {
  type Billing,
  type Evidence,
  formatProfileId,
  type Profile,
  type Route,
} from "@agnostic/core";
import type { HarnessStatus } from "./detect.js";
import type { LocalServer } from "./detect-local-servers.js";
import { gateways } from "./gateways.js";
import { harnessDefinition } from "./harness-list.js";
import { seedModels } from "./seed-models.js";

/** The key that lets a harness bill by API when its own login says nothing. */
const NATIVE_API_KEYS: Record<string, string> = {
  "claude-code": "ANTHROPIC_API_KEY",
  codex: "OPENAI_API_KEY",
};

/**
 * Everything this machine could run right now. A harness that is installed always has a native
 * profile, logged in or not: Claude Code's login lives in the Keychain, where we cannot see it.
 */
export function enumerateProfiles(
  statuses: HarnessStatus[],
  env: Record<string, string>,
  servers: LocalServer[],
): Profile[] {
  const profiles: Profile[] = [];
  for (const status of statuses) {
    if (status.path === null) {
      continue;
    }
    profiles.push(
      ...nativeProfiles(status, env),
      ...gatewayProfiles(status, env),
      ...localProfiles(status, servers),
    );
  }
  return byFirstId(profiles);
}

function nativeProfiles(status: HarnessStatus, env: Record<string, string>): Profile[] {
  const billing = nativeBilling(status, env);
  const models = status.models?.models ?? [];
  // The default profile comes first: it is the one that works before anyone picks a model.
  return [null, ...models].map((model) => profile(status, model, "native", billing, "binary"));
}

function nativeBilling(status: HarnessStatus, env: Record<string, string>): Billing {
  if (status.login === "logged-in") {
    return status.billing;
  }
  const key = NATIVE_API_KEYS[status.harness];
  return key && env[key] ? "api-key" : "unknown";
}

function gatewayProfiles(status: HarnessStatus, env: Record<string, string>): Profile[] {
  const routes = harnessDefinition(status.harness).routes;
  return gateways
    .filter(
      (gateway) =>
        gateway.harnesses.includes(status.harness) &&
        routes.includes(gateway.route) &&
        Boolean(env[gateway.envKey]),
    )
    .flatMap((gateway) =>
      seedModels(status.harness, gateway.route).map((seed) =>
        profile(status, seed.model, gateway.route, "api-key", "env"),
      ),
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
