/**
 * Retry wrapper for Anthropic SDK calls that transparently handles
 * transient server-side errors (529 overloaded_error, 503 service_unavailable,
 * 500 api_error, 429 rate_limit_error).
 *
 * Uses exponential backoff with jitter. Non-retryable errors (e.g. 400
 * invalid_request, 401 auth) are re-thrown immediately.
 */

interface AnthropicLikeError {
  status?: number;
  error?: { type?: string };
  message?: string;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 529]);
const RETRYABLE_TYPES = new Set([
  "overloaded_error",
  "api_error",
  "rate_limit_error",
  "service_unavailable",
]);

function isRetryable(err: unknown): boolean {
  const e = err as AnthropicLikeError;
  if (e?.status && RETRYABLE_STATUSES.has(e.status)) return true;
  if (e?.error?.type && RETRYABLE_TYPES.has(e.error.type)) return true;
  // Fall back to string sniffing for SDKs that wrap errors oddly
  const msg = String(e?.message ?? "");
  if (/overloaded|529|rate.?limit|service.?unavailable/i.test(msg)) return true;
  return false;
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label?: string;
}

export async function withAnthropicRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 4,
    baseDelayMs = 1000,
    maxDelayMs = 8000,
    label = "anthropic",
  } = opts;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isRetryable(err)) throw err;

      // Exponential backoff: 1s, 2s, 4s, 8s (capped) + jitter
      const exp = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const jitter = Math.random() * 0.3 * exp;
      const delay = Math.round(exp + jitter);

      const e = err as AnthropicLikeError;
      console.warn(
        `[${label}] retryable error on attempt ${attempt}/${maxAttempts} ` +
          `(status=${e?.status ?? "?"} type=${e?.error?.type ?? "?"}), ` +
          `retrying in ${delay}ms`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
