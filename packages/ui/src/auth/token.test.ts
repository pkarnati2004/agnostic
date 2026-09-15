import { describe, expect, it, vi } from "vitest";
import { readToken, TOKEN_KEY, type TokenSources } from "./token";

function sources(hash: string, stored: string | null): TokenSources & { written: string[] } {
  const written: string[] = [];
  return {
    hash,
    written,
    storage: {
      getItem: () => stored,
      setItem: (_key: string, value: string) => written.push(value),
    },
    clearFragment: vi.fn(),
  };
}

describe("readToken", () => {
  it("stores the token from the fragment and strips it", () => {
    const handles = sources("#token=abc", null);
    expect(readToken(handles)).toBe("abc");
    expect(handles.written).toEqual(["abc"]);
    expect(handles.clearFragment).toHaveBeenCalledOnce();
    expect(TOKEN_KEY).toBe("agn.token");
  });

  it("keeps a stored token when the fragment says something else", () => {
    const handles = sources("#other=1", "stored");
    expect(readToken(handles)).toBe("stored");
    expect(handles.written).toEqual([]);
    expect(handles.clearFragment).not.toHaveBeenCalled();
  });

  it("has no token when neither the fragment nor storage carries one", () => {
    const handles = sources("", null);
    expect(readToken(handles)).toBeNull();
  });
});
