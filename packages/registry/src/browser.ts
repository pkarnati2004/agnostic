// What the web page may import at runtime. The rest of the registry reads the disk and parses with
// zod, neither of which links in a browser bundle, so the page gets the one module that does
// neither: the harness names, marks and vendors. `browser.test.ts` enforces the rule.
export * from "./harness-identity.js";
