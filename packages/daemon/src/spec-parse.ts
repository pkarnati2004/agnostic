import { demoteSectionHeadings } from "@agnostic/core";

export type ParsedSpec = { title: string | null; spec: string; acceptance: string | null };

const TITLE_MAX_CHARS = 80;

const TITLE = /^#\s+(.+)$/;
const HEADING = /^##\s+(.+?)\s*:?\s*$/;
const FENCE_OPEN = /^```[a-z]*$/i;
const BOXED = /^\s*[-*+]\s+\[[ xX]\]\s/;
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;

const ACCEPTANCE_HEADINGS = ["acceptance", "acceptance criteria"];

type Sections = { preamble: string[]; spec: string[] | null; acceptance: string[] | null };

/**
 * A model's answer, read as leniently as the daemon can and never thrown from: the user sees and
 * edits whatever comes out, so a missing heading costs them a keystroke, not the whole call. Null
 * means there was no spec in it at all, which is the one case the route reports as a failure.
 */
export function parseSpecAnswer(text: string): ParsedSpec | null {
  const lines = unfence(text.replace(/\r\n/g, "\n").split("\n"));
  const titleAt = lines.findIndex((line) => TITLE.test(line));
  const sections = split(titleAt === -1 ? lines : lines.slice(titleAt + 1));
  const spec = (sections.spec ?? sections.preamble).join("\n").trim();
  if (spec === "") {
    return null;
  }
  const acceptance = boxed(sections.acceptance ?? [])
    .join("\n")
    .trim();
  return {
    title: titleAt === -1 ? null : title(lines[titleAt] ?? ""),
    spec: demoteSectionHeadings(spec),
    acceptance: acceptance === "" ? null : demoteSectionHeadings(acceptance),
  };
}

/** A whole answer wrapped in one code fence, which is how some harnesses return markdown. */
function unfence(lines: string[]): string[] {
  const first = lines.findIndex((line) => line.trim() !== "");
  const last = lines.findLastIndex((line) => line.trim() !== "");
  if (first === -1 || first === last) {
    return lines;
  }
  const opens = FENCE_OPEN.test(lines[first]?.trim() ?? "");
  const closes = (lines[last]?.trim() ?? "") === "```";
  return opens && closes ? lines.slice(first + 1, last) : lines;
}

/**
 * Everything before the first heading is the spec when there is no `## Spec`, and any other
 * heading is folded into the spec one level down rather than dropped: a model that wrote
 * `## Notes` meant the user to read it.
 */
function split(lines: string[]): Sections {
  const sections: Sections = { preamble: [], spec: null, acceptance: null };
  let current = sections.preamble;
  for (const line of lines) {
    const heading = HEADING.exec(line)?.[1];
    if (heading === undefined) {
      current.push(line);
      continue;
    }
    const name = heading.toLowerCase();
    if (name === "spec") {
      sections.spec ??= [];
      current = sections.spec;
    } else if (ACCEPTANCE_HEADINGS.includes(name)) {
      sections.acceptance ??= [];
      current = sections.acceptance;
    } else {
      sections.spec ??= [...sections.preamble];
      current = fold(sections.spec, heading);
    }
  }
  return sections;
}

/** One blank line before the folded heading, whatever the model left behind it. */
function fold(spec: string[], heading: string): string[] {
  while (spec.length > 0 && (spec.at(-1) ?? "").trim() === "") {
    spec.pop();
  }
  spec.push("", `### ${heading}`);
  return spec;
}

/** A criterion the user can tick off: a plain bullet is one, it just was not written as one. */
function boxed(lines: string[]): string[] {
  return lines.map((line) => {
    if (BOXED.test(line)) {
      return line;
    }
    const text = BULLET.exec(line)?.[1];
    return text === undefined ? line : `- [ ] ${text}`;
  });
}

function title(line: string): string {
  const text = (TITLE.exec(line)?.[1] ?? "").trim();
  return text.length > TITLE_MAX_CHARS ? text.slice(0, TITLE_MAX_CHARS).trimEnd() : text;
}
