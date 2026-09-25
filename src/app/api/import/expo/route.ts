import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ExpoImportError, importExpoPayload, validatePayload } from "@/lib/import/expo";

/**
 * POST /api/import/expo — receives the Expo pilot app's on-device bundle.
 *
 * Auth: `Authorization: Bearer <ImportCode.code>` (minted per account with
 * scripts/import/mint-code.ts). No session involved — the pilot app has no
 * login. The middleware exempts this path from the site passcode for the
 * same reason /api/healthkit-sync is exempt.
 *
 * Body: see ExpoPayload in src/lib/import/expo.ts. Re-sending is safe.
 */

export const maxDuration = 300; // macro estimation is one Anthropic call per distinct meal label
const MAX_BODY_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const code = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!code) return NextResponse.json({ error: "Missing import code" }, { status: 401 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  // ImportCode is looked up before any tenant is known — it is deliberately
  // not in the tenant-scoped model set (see prisma/schema.prisma).
  const importCode = await prisma.importCode.findUnique({ where: { code }, select: { id: true, userId: true } });
  if (!importCode) return NextResponse.json({ error: "Import code not recognised" }, { status: 401 });

  let payload;
  try {
    payload = validatePayload(await request.json());
  } catch (e) {
    const msg = e instanceof ExpoImportError ? e.message : e instanceof SyntaxError ? "Invalid JSON" : "Bad payload";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    const report = await importExpoPayload(importCode.userId, payload);
    await prisma.importCode.update({
      where: { id: importCode.id },
      data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
    });
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    console.error("[import/expo] failed", e);
    const msg = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
