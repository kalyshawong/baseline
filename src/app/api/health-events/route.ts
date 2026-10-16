import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { getLocalDayStr, getRequestTz, dateStrToUTC } from "@/lib/date-utils";
import { withAnthropicRetry } from "@/lib/anthropic-retry";
import { apiError } from "@/lib/utils";

/**
 * "What happened?" box — free text about the body, sorted by the model.
 *
 * POST { text, date } e.g. "tripped on the stairs, left ankle sore" or
 * "calves sore from a bad massage" → one or more HealthEvent rows (kind,
 * body parts, cause; severity only if she stated one).
 * GET  ?limit=n → recent events.   DELETE ?id= → remove one.
 */

const KINDS = ["injury", "soreness", "illness", "treatment", "other"] as const;
type Kind = (typeof KINDS)[number];
interface ParsedEvent {
  date: string;
  kind: Kind;
  summary: string;
  bodyParts: string[];
  cause: string | null;
  severity: number | null;
}

/** The model sometimes writes more than one JSON block; take the last one that parses. */
function lastJson(raw: string): unknown {
  const blocks: string[] = [];
  let depth = 0, start = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "{") { if (depth === 0) start = i; depth++; }
    else if (raw[i] === "}") { depth--; if (depth === 0 && start >= 0) blocks.push(raw.slice(start, i + 1)); }
  }
  for (let i = blocks.length - 1; i >= 0; i--) {
    try { return JSON.parse(blocks[i]); } catch { /* previous block */ }
  }
  return null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const toDay = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(request: NextRequest) {
  try {
    const limit = Math.min(50, Number(request.nextUrl.searchParams.get("limit") ?? 10) || 10);
    const events = await prisma.healthEvent.findMany({ orderBy: [{ day: "desc" }, { createdAt: "desc" }], take: limit });
    return NextResponse.json({ events: events.map((e) => ({ ...e, day: toDay(e.day) })) });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    // deleteMany so the tenant scope applies (a bare delete-by-id would not be scoped).
    const r = await prisma.healthEvent.deleteMany({ where: { id } });
    return NextResponse.json({ deleted: r.count });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { text, date: chosenDate } = await request.json();
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }
    if (text.length > 2000) return NextResponse.json({ error: "Keep it under 2000 characters" }, { status: 400 });

    const todayStr = getLocalDayStr(await getRequestTz());
    const defaultDate = typeof chosenDate === "string" && DATE_RE.test(chosenDate) && chosenDate <= todayStr ? chosenDate : todayStr;

    const client = new Anthropic();
    const resp = await withAnthropicRetry(() =>
      client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        messages: [{
          role: "user",
          content: `Sort this note about what happened to someone's body into JSON. Today's date: ${todayStr}. Date chosen by the user: ${defaultDate}.

Rules:
- One entry per distinct thing that happened. "Tripped and hurt my ankle, also calves sore from a massage" = 2 entries.
- date: use the chosen date (${defaultDate}) UNLESS the text names a day ("yesterday", "Sunday", "Oct 12") — then resolve it against today. Never after today.
- kind: one of ${KINDS.join(", ")}. A fall, twist, strain or impact = injury. Muscle soreness/tightness = soreness. Sick, cold, fever = illness. Massage, physio, ice bath, stretching session = treatment (unless the point is the soreness it caused — "sore from a bad massage" is soreness with cause "bad massage").
- summary: under 60 characters, plain, in her words where possible (e.g. "Tripped on stairs — left ankle").
- bodyParts: lowercase, specific, keep the side when given ("left ankle", "calves", "lower back"). Empty list if none.
- cause: the cause if stated ("tripped on the stairs", "deep-tissue massage"), else null. Never guess one.
- severity: a 1-10 number ONLY if she gave one or an unambiguous word ("mild" ≈ 3, "really bad"/"severe" ≈ 8). Otherwise null. Never invent.
- Respond with ONLY the JSON:
{"events":[{"date":"YYYY-MM-DD","kind":string,"summary":string,"bodyParts":[string],"cause":string|null,"severity":n|null}]}

Note: ${text.trim()}`,
        }],
      }),
    );
    const raw = resp.content[0]?.type === "text" ? resp.content[0].text : "";
    const parsed = lastJson(raw) as { events?: ParsedEvent[] } | null;
    const list = (parsed?.events ?? []).filter((e) => e && typeof e.summary === "string" && e.summary.trim());
    if (!list.length) {
      console.error("[health-events] unparseable model output:", raw.slice(0, 400));
      return NextResponse.json({ error: "Couldn't make sense of that — try something like \"tripped on the stairs, left ankle sore\"" }, { status: 422 });
    }

    const userId = await getCurrentUserId();
    const created = [];
    for (const e of list) {
      const day = DATE_RE.test(e.date) && e.date <= todayStr ? e.date : defaultDate;
      const kind: Kind = (KINDS as readonly string[]).includes(e.kind) ? e.kind : "other";
      const sev = typeof e.severity === "number" && e.severity >= 1 && e.severity <= 10 ? Math.round(e.severity) : null;
      const row = await prisma.healthEvent.create({
        data: {
          userId,
          day: dateStrToUTC(day),
          kind,
          summary: e.summary.trim().slice(0, 120),
          text: text.trim(),
          bodyParts: Array.isArray(e.bodyParts) ? e.bodyParts.filter((b) => typeof b === "string" && b.trim()).map((b) => b.trim().toLowerCase()).slice(0, 8) : [],
          cause: typeof e.cause === "string" && e.cause.trim() ? e.cause.trim().slice(0, 200) : null,
          severity: sev,
        },
      });
      created.push({ ...row, day: toDay(row.day) });
    }
    return NextResponse.json({ events: created });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
