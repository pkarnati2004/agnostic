/**
 * A daemon hint names the command to run in backticks, the way the CLI prints it. The workspace
 * shows those as code, so the reader sees the command rather than the markup around it.
 */
export function HintText({ hint }: { hint: string }) {
  return (
    <>
      {parts(hint).map((part) =>
        part.code ? (
          <code key={part.key} className="rounded bg-muted px-1 py-0.5 font-mono">
            {part.text}
          </code>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

type Part = { key: string; text: string; code: boolean };

/** Split on backtick pairs: the odd pieces are what was between them. A lone backtick stays text. */
function parts(hint: string): Part[] {
  return hint
    .split(/`([^`]+)`/)
    .map((text, index) => ({ key: `${index}:${text}`, text, code: index % 2 === 1 }))
    .filter((part) => part.text !== "");
}
