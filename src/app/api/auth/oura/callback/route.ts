import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/?error=missing_params", request.url));
  }

  // Validate CSRF state
  const storedState = request.cookies.get("oura_oauth_state")?.value;
  if (state !== storedState) {
    return NextResponse.redirect(
      new URL("/?error=invalid_state", request.url)
    );
  }

  // Exchange authorization code for tokens
  const tokenRes = await fetch("https://api.ouraring.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: process.env.OURA_CLIENT_ID!,
      client_secret: process.env.OURA_CLIENT_SECRET!,
      redirect_uri: process.env.OURA_REDIRECT_URI!,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error("Token exchange failed:", err);
    return NextResponse.redirect(
      new URL("/?error=token_exchange_failed", request.url)
    );
  }

  const tokens: TokenResponse = await tokenRes.json();

  // Store tokens — upsert so re-auth replaces old tokens
  const existing = await prisma.ouraToken.findFirst();
  if (existing) {
    await prisma.ouraToken.update({
      where: { id: existing.id },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scope: "daily heartrate personal session workout",
      },
    });
  } else {
    await prisma.ouraToken.create({
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scope: "daily heartrate personal session workout",
      },
    });
  }

  // Clear the state cookie and redirect to dashboard
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete("oura_oauth_state");
  return response;
}
