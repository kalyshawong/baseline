import { NextResponse } from "next/server";
import crypto from "crypto";
import { apiError } from "@/lib/utils";

export async function GET() {
  try {
    const state = crypto.randomBytes(16).toString("hex");

    const params = new URLSearchParams({
      client_id: process.env.OURA_CLIENT_ID!,
      redirect_uri: process.env.OURA_REDIRECT_URI!,
      response_type: "code",
      scope: "daily heartrate personal session workout",
      state,
    });

    // Store state in a cookie for CSRF validation
    const authorizeUrl = `https://cloud.ouraring.com/oauth/authorize?${params}`;

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set("oura_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 600, // 10 minutes
      sameSite: "lax",
    });

    return response;
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
