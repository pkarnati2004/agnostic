import { describe, expect, it } from "vitest";
import { limitPermissions, requestAllowed } from "./request-filter.js";

const ORIGIN = "http://127.0.0.1:7555";
const APP = "/Applications/agnostic.app/Contents/Resources/app";

describe("requestAllowed", () => {
  it("allows the daemon's page, its API and its terminal socket", () => {
    expect(requestAllowed(`${ORIGIN}/ui/assets/index.js`, ORIGIN, APP)).toBe(true);
    expect(requestAllowed(`${ORIGIN}/tasks`, ORIGIN, APP)).toBe(true);
    expect(requestAllowed("ws://127.0.0.1:7555/tasks/t1/terminal", ORIGIN, APP)).toBe(true);
  });

  it("allows the app's own status page, its script and DevTools", () => {
    expect(requestAllowed(`file://${APP}/status.html?state=starting`, ORIGIN, APP)).toBe(true);
    expect(requestAllowed(`file://${APP}/status.js`, ORIGIN, APP)).toBe(true);
    expect(requestAllowed("devtools://devtools/bundled/inspector.html", ORIGIN, APP)).toBe(true);
  });

  it("refuses another port, https, localhost and a foreign file", () => {
    expect(requestAllowed("http://127.0.0.1:7431/health", ORIGIN, APP)).toBe(false);
    expect(requestAllowed("ws://127.0.0.1:7431/x", ORIGIN, APP)).toBe(false);
    expect(requestAllowed("https://127.0.0.1:7555/ui", ORIGIN, APP)).toBe(false);
    expect(requestAllowed("http://localhost:7555/ui", ORIGIN, APP)).toBe(false);
    expect(requestAllowed("file:///etc/passwd", ORIGIN, APP)).toBe(false);
    expect(requestAllowed(`file://${APP}-evil/status.html`, ORIGIN, APP)).toBe(false);
    expect(requestAllowed(`file://${APP}/agnd/agnd.js`, ORIGIN, APP)).toBe(false);
    expect(requestAllowed(`file://${APP}/agnd/ui/index.html`, ORIGIN, APP)).toBe(false);
    expect(requestAllowed(`file://${APP}/node_modules/x/index.js`, ORIGIN, APP)).toBe(false);
    expect(requestAllowed(`file://${APP}/main.js`, ORIGIN, APP)).toBe(false);
    expect(requestAllowed("https://example.com/", ORIGIN, APP)).toBe(false);
  });

  it("refuses every http request while no daemon origin is known", () => {
    expect(requestAllowed(`${ORIGIN}/ui`, "", APP)).toBe(false);
  });

  it("refuses a ws socket to another port or to localhost, and any other scheme", () => {
    expect(requestAllowed("ws://localhost:7555/x", ORIGIN, APP)).toBe(false);
    expect(requestAllowed("wss://127.0.0.1:7555/x", ORIGIN, APP)).toBe(false);
    expect(requestAllowed("data:text/html,hi", ORIGIN, APP)).toBe(false);
    expect(requestAllowed("ftp://127.0.0.1:7555/", ORIGIN, APP)).toBe(false);
  });

  it("refuses the status file's directory itself and a path that climbs out of it", () => {
    expect(requestAllowed(`file://${APP}`, ORIGIN, APP)).toBe(false);
    expect(requestAllowed(`file://${APP}/../secret.txt`, ORIGIN, APP)).toBe(false);
  });

  it("refuses a string that is not a URL", () => {
    expect(requestAllowed("not a url", ORIGIN, APP)).toBe(false);
  });
});

describe("limitPermissions", () => {
  type Request = (contents: unknown, permission: string, cb: (granted: boolean) => void) => void;
  type Check = (contents: unknown, permission: string) => boolean;

  function handlers(): { request: Request; check: Check } {
    let request: Request | null = null;
    let check: Check | null = null;
    limitPermissions({
      setPermissionRequestHandler: (handler) => {
        request = handler;
      },
      setPermissionCheckHandler: (handler) => {
        check = handler;
      },
    });
    if (request === null || check === null) {
      throw new Error("a handler was not installed");
    }
    return { request, check };
  }

  it("refuses camera, notifications, location and clipboard reads, asked or checked", () => {
    const { request, check } = handlers();
    const refused = ["media", "notifications", "geolocation", "clipboard-read", "openExternal"];
    const answers: boolean[] = [];
    for (const permission of refused) {
      request(null, permission, (granted) => answers.push(granted));
    }
    expect(answers).toEqual(refused.map(() => false));
    expect(refused.map((permission) => check(null, permission))).toEqual(refused.map(() => false));
  });

  it("grants the sanitized clipboard write the copy buttons use", () => {
    const { request, check } = handlers();
    const answers: boolean[] = [];
    request(null, "clipboard-sanitized-write", (granted) => answers.push(granted));
    expect(answers).toEqual([true]);
    expect(check(null, "clipboard-sanitized-write")).toBe(true);
  });
});
