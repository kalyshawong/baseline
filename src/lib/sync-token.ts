import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Per-user HealthKit sync tokens (2026-09-25).
 *
 * The native plugin POSTs from URLSession, so it carries no session cookie.
 * Before this, every native post authenticated with one shared key that was
 * also shipped in the client bundle (NEXT_PUBLIC_HEALTHKIT_SYNC_KEY) and
 * resolved to Kalysha's tenant — so anyone's phone synced into her account.
 *
 * Now the signed-in webview asks /api/native/sync-token for a token bound to
 * ITS user and hands that to the plugin. Format: `bst1.<userId>.<hmac>`.
 * Stateless (no table): the HMAC proves the server minted it for that user.
 * Revoke all tokens by rotating SYNC_TOKEN_SECRET (falls back to AUTH_SECRET).
 */

const PREFIX = "bst1";

function secret(): string {
  const s = process.env.SYNC_TOKEN_SECRET || process.env.AUTH_SECRET;
  if (!s) throw new Error("SYNC_TOKEN_SECRET/AUTH_SECRET not set");
  return s;
}

function sign(userId: string): string {
  return createHmac("sha256", secret()).update(`${PREFIX}.${userId}`).digest("base64url");
}

export function mintSyncToken(userId: string): string {
  return `${PREFIX}.${userId}.${sign(userId)}`;
}

/** Returns the userId the token was minted for, or null if it isn't valid. */
export function verifySyncToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX || !parts[1]) return null;
  const [, userId, mac] = parts;
  let expected: string;
  try {
    expected = sign(userId);
  } catch {
    return null;
  }
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return userId;
}
