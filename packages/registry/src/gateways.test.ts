import { describe, expect, it } from "vitest";
import { gatewayFor, gateways } from "./gateways.js";
import { harnessDefinition } from "./harness-list.js";

describe("gateways", () => {
  it("names the key and base URL of each non-native route", () => {
    expect(gateways.map((gateway) => gateway.route)).toEqual(["anthropic-gateway", "openrouter"]);
    expect(gatewayFor("anthropic-gateway")).toEqual({
      route: "anthropic-gateway",
      envKey: "MOONSHOT_API_KEY",
      baseUrl: "https://api.moonshot.ai/anthropic",
      harnesses: ["claude-code"],
    });
    expect(gatewayFor("openrouter")).toEqual({
      route: "openrouter",
      envKey: "OPENROUTER_API_KEY",
      baseUrl: null,
      harnesses: ["pi", "opencode"],
    });
  });

  it("has no gateway for the routes a harness owns itself", () => {
    expect(gatewayFor("native")).toBeNull();
    expect(gatewayFor("local")).toBeNull();
  });

  it("only lists harnesses whose table row takes that route", () => {
    for (const gateway of gateways) {
      for (const harness of gateway.harnesses) {
        expect(harnessDefinition(harness).routes).toContain(gateway.route);
      }
    }
  });
});
