import { type Event, EventSchema } from "./event.js";

// The SSE line terminator is CRLF, CR or LF, and a blank line ends a frame (WHATWG "event stream").
const LINE = /\r\n|\r|\n/;

/** Reads an SSE response body, yielding one event per complete frame. */
export async function* readFrames(response: Response): AsyncGenerator<Event> {
  if (response.body === null) {
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let lines: string[] = [];
  let buffer = "";
  while (true) {
    const chunk = await reader.read().catch(() => ({ done: true, value: undefined }) as const);
    if (chunk.done) {
      return;
    }
    buffer += decoder.decode(chunk.value, { stream: true });
    const complete = buffer.split(LINE);
    // The last piece has no terminator yet, so it waits for the next chunk.
    buffer = complete.pop() ?? "";
    for (const line of complete) {
      if (line !== "") {
        lines.push(line);
        continue;
      }
      const event = parseFrame(lines);
      lines = [];
      if (event !== null) {
        yield event;
      }
    }
  }
}

/** Comments (`: ping`) and `retry:` carry no event; anything unparsable is skipped, not thrown. */
function parseFrame(lines: string[]): Event | null {
  // A field's value may be split over several `data:` lines, which rejoin with a newline.
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).replace(/^ /, ""));
  if (data.length === 0) {
    return null;
  }
  try {
    return EventSchema.parse(JSON.parse(data.join("\n")));
  } catch {
    return null;
  }
}
