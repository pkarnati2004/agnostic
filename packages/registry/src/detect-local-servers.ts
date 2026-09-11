import { z } from "zod";

export type LocalServer = {
  name: "lmstudio" | "ollama";
  port: number;
  baseUrl: string;
  models: string[];
};

type LocalServerPort = { name: LocalServer["name"]; port: number };

const DEFAULT_PORTS: LocalServerPort[] = [
  { name: "lmstudio", port: 1234 },
  { name: "ollama", port: 11434 },
];

const DEFAULT_TIMEOUT_MS = 1_500;

/** The OpenAI-compatible listing both servers expose; anything else means nobody is home. */
const ModelListSchema = z.object({
  data: z.array(z.object({ id: z.string().min(1) }).loose()),
});

/**
 * The one network call in agn, and it never leaves the machine: ADR 002 allows loopback only.
 * A port that does not answer, answers badly, or answers slowly is simply not running.
 */
export async function detectLocalServers(opts?: {
  ports?: LocalServerPort[];
  timeoutMs?: number;
}): Promise<LocalServer[]> {
  const ports = opts?.ports ?? DEFAULT_PORTS;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const servers = await Promise.all(ports.map((port) => readServer(port, timeoutMs)));
  return servers.filter((server): server is LocalServer => server !== null);
}

async function readServer(
  { name, port }: LocalServerPort,
  timeoutMs: number,
): Promise<LocalServer | null> {
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return null;
    }
    const listing = ModelListSchema.safeParse(await response.json());
    if (!listing.success) {
      return null;
    }
    return { name, port, baseUrl, models: listing.data.data.map((model) => model.id) };
  } catch {
    return null;
  }
}
