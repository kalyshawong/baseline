import { NextRequest, NextResponse } from "next/server";
import { syncOuraData } from "@/lib/sync";

export async function POST(request: NextRequest) {
  // Simple API key auth for the sync endpoint
  const authHeader = request.headers.get("authorization");
  const apiKey = process.env.SYNC_API_KEY;

  // Allow from browser (no key needed for on-demand button) or with API key (for cron)
  const referer = request.headers.get("referer");
  const isFromApp = referer?.includes(process.env.NEXT_PUBLIC_APP_URL || "localhost");

  if (!isFromApp && authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const lookbackDays = Number(
      new URL(request.url).searchParams.get("days") ?? "7"
    );
    const result = await syncOuraData(lookbackDays);
    return NextResponse.json({
      success: true,
      synced: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Sync failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Sync failed",
      },
      { status: 500 }
    );
  }
}
