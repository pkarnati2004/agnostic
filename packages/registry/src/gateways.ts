import type { HarnessId, Route } from "@agnostic/core";

type GatewayRoute = Exclude<Route, "native" | "local">;

/** A provider agn can point a harness at: the key it needs, the base URL, and who accepts it. */
export type Gateway = {
  route: GatewayRoute;
  envKey: string;
  baseUrl: string | null;
  harnesses: HarnessId[];
};

export const gateways: readonly Gateway[] = [
  {
    route: "anthropic-gateway",
    envKey: "MOONSHOT_API_KEY",
    baseUrl: "https://api.moonshot.ai/anthropic",
    harnesses: ["claude-code"],
  },
  // OpenRouter needs no base URL: Pi and OpenCode already know the provider, only the key is ours.
  {
    route: "openrouter",
    envKey: "OPENROUTER_API_KEY",
    baseUrl: null,
    harnesses: ["pi", "opencode"],
  },
];

export function gatewayFor(route: Route): Gateway | null {
  return gateways.find((gateway) => gateway.route === route) ?? null;
}
