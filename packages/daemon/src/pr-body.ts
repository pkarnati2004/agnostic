import { demoteSectionHeadings, type TaskNote } from "@agnostic/core";

/**
 * The pull request's description: what the task was asked to do, what it has to satisfy, and the
 * last thing said to the agent that did it. The note's own headings are demoted on the way in, as
 * the note writer does, so a `## ` line inside a section cannot pass for a section of the body.
 */
export function composePrBody(note: TaskNote): string {
  const sections = [section("Spec", note.spec)];
  if (note.acceptance !== null) {
    sections.push(section("Acceptance", note.acceptance));
  }
  const latest = note.handoffs.at(-1);
  if (latest !== undefined) {
    sections.push(section("Handoff", latest.body));
  }
  return `${sections.join("\n\n")}\n\n---\nagn task ${note.id}`;
}

function section(heading: string, body: string): string {
  return `## ${heading}\n\n${demoteSectionHeadings(body.trim())}`;
}
