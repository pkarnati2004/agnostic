// The smoke's terminal client: `terminal-roundtrip.mjs <ws-url> <token> <agent-log>` connects to
// WS /tasks/:id/terminal with the token as its subprotocol, sizes the pane, types a line, and
// checks that the line reached the agent and came back drawn. Node's own WebSocket sends no
// Origin header, which is what the daemon expects from a client that is not a page.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const [url, token, agentLog] = process.argv.slice(2);
const session = `agn-${new URL(url).pathname.split("/")[2]}`;

const received = [];
let ready = false;

const ws = new WebSocket(url, [`agn-token.${token}`]);
ws.binaryType = "arraybuffer";
ws.addEventListener("message", (event) => {
  if (typeof event.data === "string") {
    ready ||= JSON.parse(event.data).type === "ready";
    return;
  }
  received.push(Buffer.from(event.data));
});
ws.addEventListener("error", () => fail("the socket could not be opened"));

await opened();
if (ws.protocol !== `agn-token.${token}`) {
  fail(`the daemon accepted another protocol: ${ws.protocol}`);
}

ws.send(JSON.stringify({ type: "resize", cols: 120, rows: 40 }));
await until("the daemon says ready", () => ready);
await until("the pane draws itself", () => received.length > 0);

ws.send(JSON.stringify({ type: "resize", cols: 97, rows: 30 }));
await until("the pane is 97 columns wide", () => paneWidth() === "97");

ws.send(Buffer.from("smoke-typed\r", "utf8"));
await until("the agent read the typed line", () => log().includes("line: smoke-typed"));
// The redraw carries the agent's own output, which a tmux stuck on a config error never draws. The
// typed line is what this reads rather than the agent's first line: the launch prompt is long
// enough to scroll that one out of the pane.
await until("the pane drew the typed line", () => drawn().includes("line: smoke-typed"));

ws.close();
await until("the socket is closed", () => ws.readyState === WebSocket.CLOSED);

function paneWidth() {
  try {
    return execFileSync("tmux", ["-L", "agn", "display-message", "-p", "-t", session, "#{pane_width}"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function log() {
  try {
    return readFileSync(agentLog, "utf8");
  } catch {
    return "";
  }
}

function drawn() {
  return Buffer.concat(received).toString("utf8");
}

function opened() {
  return new Promise((done) => {
    ws.addEventListener("open", done, { once: true });
  });
}

async function until(what, check) {
  for (let waited = 0; waited < 200; waited += 1) {
    if (check()) {
      return;
    }
    await sleep(50);
  }
  fail(`${what} did not happen`);
}

function fail(message) {
  process.stderr.write(`terminal-roundtrip: ${message}\n`);
  process.exit(1);
}
