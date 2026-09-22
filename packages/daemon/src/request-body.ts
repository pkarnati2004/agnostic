/** A POST with no body at all is the common case for an action with only optional fields. */
export async function requestBody(request: Request): Promise<unknown> {
  const text = await request.text().catch(() => "");
  if (text.trim() === "") {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Not json at all: the schema says so in the same words as every other bad request.
    return null;
  }
}
