import { type AgnosticPaths, readYamlFile } from "@agnostic/core";
import { z } from "zod";

// Strict: a misspelled key must be an error, not a port silently back at the default.
const DaemonConfigFileSchema = z.strictObject({
  port: z.number().int().min(1).max(65535).optional(),
});

type DaemonConfig = { port: number | null };

/**
 * `~/.agnostic/config.yaml` holds user settings for the machine, not for a repo. `port` is its
 * first key; this reader moves to core when a second component needs the same file.
 */
export async function readDaemonConfig(paths: AgnosticPaths): Promise<DaemonConfig> {
  const file = await readYamlFile(
    paths.config,
    DaemonConfigFileSchema,
    `Fix ${paths.config}, or delete it to use the defaults.`,
  );
  return { port: file?.port ?? null };
}
