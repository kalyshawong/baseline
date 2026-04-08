import { prisma } from "./db";

const OURA_API_BASE = "https://api.ouraring.com/v2/usercollection";
const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";

export class OuraScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OuraScopeError";
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export async function getValidToken(): Promise<string> {
  const token = await prisma.ouraToken.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!token) {
    throw new Error("No Oura token found. Please authenticate first.");
  }

  // Refresh if expiring within 5 minutes
  if (token.expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    return refreshAccessToken(token.id, token.refreshToken);
  }

  return token.accessToken;
}

async function refreshAccessToken(
  tokenId: number,
  refreshToken: string
): Promise<string> {
  const res = await fetch(OURA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.OURA_CLIENT_ID!,
      client_secret: process.env.OURA_CLIENT_SECRET!,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const data: TokenResponse = await res.json();

  await prisma.ouraToken.update({
    where: { id: tokenId },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  });

  return data.access_token;
}

async function forceRefreshToken(): Promise<string> {
  const token = await prisma.ouraToken.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  if (!token) throw new Error("No Oura token found. Please authenticate first.");
  return refreshAccessToken(token.id, token.refreshToken);
}

export async function ouraFetch<T>(
  endpoint: string,
  params: Record<string, string>
): Promise<T> {
  const token = await getValidToken();
  const url = new URL(`${OURA_API_BASE}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });

    if (res.status === 401) {
      // Force refresh — don't re-call getValidToken which may return the same expired token
      const freshToken = await forceRefreshToken();
      const retry = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${freshToken}` },
        signal: controller.signal,
      });
      if (!retry.ok) throw new Error(`Oura API error: ${retry.status}`);
      return retry.json();
    }

    if (res.status === 403) {
      throw new OuraScopeError(`Oura ${endpoint}: 403 — scope not granted. User needs to re-authenticate.`);
    }

    if (res.status === 429) {
      throw new Error("Oura API rate limited. Try again later.");
    }

    if (!res.ok) {
      throw new Error(`Oura API error: ${res.status} ${await res.text()}`);
    }

    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}
