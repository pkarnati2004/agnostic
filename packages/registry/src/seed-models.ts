import { type HarnessId, HarnessIdSchema, type Route, RouteSchema } from "@agnostic/core";
import { z } from "zod";
import { RegistryError } from "./error.js";
import rows from "./models.json" with { type: "json" };

/**
 * The seed list: what agn offers for a harness whose own probe says nothing, and the whole list
 * for the gateway routes no harness can enumerate. Data rather than code because chunk 11's
 * catalog Action regenerates `models.json` in place.
 */
const SeedModelSchema = z.object({
  harness: HarnessIdSchema,
  model: z.string().min(1),
  route: RouteSchema,
  /** Still launchable and still scored, but not what agn suggests. */
  legacy: z.boolean().default(false),
});

export type SeedModel = z.infer<typeof SeedModelSchema>;

const seeds = parseSeedModels(rows);

export function seedModels(harness: HarnessId, route: Route): SeedModel[] {
  return seeds.filter((seed) => seed.harness === harness && seed.route === route);
}

export function parseSeedModels(raw: unknown): SeedModel[] {
  const list = z.array(z.unknown()).safeParse(raw);
  if (!list.success) {
    throw seedInvalid("models.json is not a list of model rows", list.error);
  }
  return list.data.map((row, index) => {
    const seed = SeedModelSchema.safeParse(row);
    if (!seed.success) {
      throw seedInvalid(`row ${index} of models.json is not a model row`, seed.error);
    }
    return seed.data;
  });
}

function seedInvalid(message: string, cause: unknown): RegistryError {
  return new RegistryError(message, {
    code: "seed-invalid",
    hint: "Reinstall agn; models.json ships with the registry package.",
    cause,
  });
}
