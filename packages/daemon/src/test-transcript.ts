import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TestDaemon } from "./test-daemon.js";

/**
 * The file a native resume looks for before it hands a session id back. Claude Code names its
 * transcript after the id, and every task test that resumes natively runs under that harness.
 */
export async function seedTranscript(daemon: TestDaemon, sessionId: string): Promise<void> {
  const dir = join(daemon.home, ".claude", "projects", "-seeded");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${sessionId}.jsonl`), "", "utf8");
}
