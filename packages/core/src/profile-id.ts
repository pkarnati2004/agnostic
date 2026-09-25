import { CoreError } from "./error.js";

// The web page imports these through `@agnostic/core/browser`, so nothing here may reach for zod:
// the schemas that wrap them live in `profile.ts`.

// Every harness agn has a registry row for has a bare id, whatever its tier (ADR 035); `other:`
// means only "an executable agn knows nothing else about", which is why it is the one two-segment
// harness a profile id can carry.
export type HarnessId = string | `other:${string}`;

const BARE_HARNESS = /^[a-z][a-z0-9-]*$/;
const OTHER_PREFIX = "other:";

export function isHarnessId(value: string): boolean {
  if (value.startsWith(OTHER_PREFIX)) {
    return value.length > OTHER_PREFIX.length;
  }
  return BARE_HARNESS.test(value);
}

export const ROUTES = [
  "native",
  "anthropic-gateway",
  "openai-compatible",
  "openrouter",
  "local",
] as const;
export type Route = (typeof ROUTES)[number];

const ROUTE_SET: ReadonlySet<string> = new Set(ROUTES);

function isRoute(value: string): value is Route {
  return ROUTE_SET.has(value);
}

const DEFAULT_MODEL_SEGMENT = "default";

export function formatProfileId(harness: HarnessId, model: string | null, route: Route): string {
  return `${harness}:${model ?? DEFAULT_MODEL_SEGMENT}:${route}`;
}

export function parseProfileId(id: string): {
  harness: HarnessId;
  model: string | null;
  route: Route;
} {
  // The first colon ends the harness, the last starts the route, everything between is the model
  // verbatim, so "codex:qwen3:8b:local" is legal.
  const segments = id.split(":");
  const harnessLength = segments[0] === "other" ? 2 : 1;
  const harness = segments.slice(0, harnessLength).join(":");
  const model = segments.slice(harnessLength, -1).join(":");
  const route = segments.length > harnessLength ? (segments.at(-1) ?? "") : "";
  if (!isHarnessId(harness) || model.length === 0 || !isRoute(route)) {
    throw new CoreError(`"${id}" is not a profile id`, {
      code: "invalid-profile-id",
      hint: "A profile id looks like claude-code:sonnet-4.5:native.",
    });
  }
  return {
    harness,
    model: model === DEFAULT_MODEL_SEGMENT ? null : model,
    route,
  };
}
