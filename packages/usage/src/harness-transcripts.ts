import type { HarnessId } from "@agnostic/core";
import { claudeCodeParser } from "./claude-code/parse.js";
import { codexParser } from "./codex/parse.js";
import { opencodeParser } from "./opencode/parse.js";
import { piFamilyParser } from "./pi/parse.js";
import type { TranscriptParser } from "./transcript-parser.js";

/** A harness that writes a transcript agn can read has a row here and nothing else. */
const PARSERS: TranscriptParser[] = [
  claudeCodeParser,
  codexParser,
  piFamilyParser("pi"),
  piFamilyParser("omp"),
  opencodeParser,
];

export function transcriptParser(harness: HarnessId): TranscriptParser | null {
  return PARSERS.find((parser) => parser.harness === harness) ?? null;
}
