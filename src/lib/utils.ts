/**
 * Safe JSON.parse wrapper that returns a fallback value on parse failure
 * instead of throwing. Use for any database fields stored as JSON strings.
 */
export function safeJsonParse<T>(str: string | null | undefined, fallback: T): T {
  if (str == null) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    console.error("safeJsonParse failed for:", str.slice(0, 100));
    return fallback;
  }
}

/**
 * Wraps request.json() to catch SyntaxError from malformed bodies.
 * Returns [data, null] on success, [null, Response] on failure.
 */
export async function parseRequestBody<T>(
  request: Request
): Promise<[T, null] | [null, { error: string }]> {
  try {
    const data = await request.json();
    return [data as T, null];
  } catch (e) {
    if (e instanceof SyntaxError) {
      return [null, { error: "Invalid JSON in request body" }];
    }
    return [null, { error: "Failed to parse request body" }];
  }
}

/**
 * Standardized API error handler. Detects common error types and returns
 * appropriate HTTP status codes.
 */
export function apiError(error: unknown): { status: number; body: { error: string } } {
  // Malformed JSON body
  if (error instanceof SyntaxError) {
    return { status: 400, body: { error: "Invalid JSON in request body" } };
  }

  // Prisma: record not found
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2025"
  ) {
    return { status: 404, body: { error: "Record not found" } };
  }

  // Prisma: unique constraint violation
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  ) {
    return { status: 409, body: { error: "A record with this value already exists" } };
  }

  // Everything else
  const message = error instanceof Error ? error.message : "Internal server error";
  console.error("API error:", error);
  return { status: 500, body: { error: message } };
}
