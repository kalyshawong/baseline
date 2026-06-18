import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { syncOuraData } from "@/lib/sync";
import { apiError } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    // Simple API key auth for the sync endpoint
    const authHeader = request.headers.get("authorization");
    const apiKey = process.env.SYNC_API_KEY;

    // Allow from browser (no key needed for on-demand button) or with API key (for cron)
    const referer = request.headers.get("referer");
    const isFromApp = referer?.includes(process.env.NEXT_PUBLIC_APP_URL || "localhost");

    if (!isFromApp && authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate lookbackDays: must be a finite integer in [1, 365]
    const rawDays = new URL(request.url).searchParams.get("days") ?? "7";
    const parsedDays = Number(rawDays);
    if (!Number.isFinite(parsedDays) || !Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 365) {
      return NextResponse.json(
        { error: "Invalid 'days' query param. Must be an integer between 1 and 365." },
        { status: 400 }
      );
    }
    const lookbackDays = parsedDays;
    const result = await syncOuraData(lookbackDays);

    // Sync touches readiness, sleep, stress, HRV, activity, sessions, etc. —
    // every dashboard surface depends on it. Revalidate so the "Last sync"
    // timestamp and metric cards refresh without the user having to reload.
    revalidatePath("/", "layout");

    return NextResponse.json({
      success: true,
      synced: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
