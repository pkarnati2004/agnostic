import type { z } from "zod";

/** Names the offending key, because "invalid" without a key sends the user reading the whole file. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const key = issue.path.join(".");
      return key ? `${key}: ${issue.message}` : issue.message;
    })
    .join("; ");
}
