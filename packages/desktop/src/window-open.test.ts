import { describe, expect, it } from "vitest";
import { openTarget } from "./window-open.js";

describe("openTarget", () => {
  it("opens about:blank as a hidden child for Create PR to point somewhere", () => {
    expect(openTarget("about:blank")).toEqual({ kind: "hidden-child" });
  });

  it("treats an empty url like about:blank", () => {
    expect(openTarget("")).toEqual({ kind: "hidden-child" });
  });

  it("sends http and https to the default browser", () => {
    const pr = "https://github.com/acme/petal/pull/7";
    expect(openTarget(pr)).toEqual({ kind: "external", url: pr });
    expect(openTarget("http://example.com/")).toEqual({
      kind: "external",
      url: "http://example.com/",
    });
  });

  it("denies every other scheme and anything that is not a URL", () => {
    expect(openTarget("file:///etc/passwd")).toEqual({ kind: "deny" });
    expect(openTarget("javascript:alert(1)")).toEqual({ kind: "deny" });
    expect(openTarget("not a url")).toEqual({ kind: "deny" });
  });
});
