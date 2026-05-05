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
 * Parse a query-string integer with NaN guard and inclusive range clamp.
 * Returns `defaultValue` on null/NaN/out-of-range. Use for ?days, ?weeks, ?limit, etc.
 * — anywhere a user-controlled int feeds into Date math, Prisma `take`, or window math.
 */
export function parseIntInRange(
  raw: string | null | undefined,
  defaultValue: number,
  min: number,
  max: number
): number {
  if (raw == null) return defaultValue;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) return defaultValue;
  return n;
}

// ---------------------------------------------------------------------------
// Per-field input validators. Each returns an error string or null. Compose
// with collectErrors(). Designed for inline use in route handlers — keeps
// individual routes terse without a heavyweight schema library.
// ---------------------------------------------------------------------------

export function validateString(
  value: unknown,
  field: string,
  opts: { maxLen: number; required?: boolean }
): string | null {
  if (value == null) return opts.required ? `${field} is required` : null;
  if (typeof value !== "string") return `${field} must be a string`;
  if (value.length > opts.maxLen) return `${field} must be ≤${opts.maxLen} chars`;
  return null;
}

export function validateEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
  opts: { required?: boolean } = {}
): string | null {
  if (value == null) return opts.required ? `${field} is required` : null;
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    return `${field} must be one of: ${allowed.join(", ")}`;
  }
  return null;
}

export function validateDateString(
  value: unknown,
  field: string,
  opts: { required?: boolean } = {}
): string | null {
  if (value == null) return opts.required ? `${field} is required` : null;
  if (typeof value !== "string") return `${field} must be an ISO date string`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return `${field} must be a valid ISO date string`;
  return null;
}

export function validateNumber(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number; integer?: boolean; required?: boolean } = {}
): string | null {
  if (value == null) return opts.required ? `${field} is required` : null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return `${field} must be a number`;
  }
  if (opts.integer && !Number.isInteger(value)) return `${field} must be an integer`;
  if (opts.min != null && value < opts.min) return `${field} must be ≥${opts.min}`;
  if (opts.max != null && value > opts.max) return `${field} must be ≤${opts.max}`;
  return null;
}

export function collectErrors(...errs: (string | null)[]): string | null {
  const filtered = errs.filter((e): e is string => e != null);
  return filtered.length > 0 ? filtered.join("; ") : null;
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
