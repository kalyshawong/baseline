import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { withAnthropicRetry } from "@/lib/anthropic-retry";
import { apiError } from "@/lib/utils";

/**
 * Natural-language workout logger — the nutrition logger's pattern for lifts.
 *
 * POST { text } where text is e.g.
 *   "legs two days ago: bulgarians 3x8 @25kg, RDLs 4x10 @60"
 * → Claude parses into a structured session → WorkoutSession + WorkoutSets.
 * Exercise names match the library case-insensitively (incl. common nicknames
 * via the model); unknown exercises are created as custom entries.
 */

interface ParsedSet {
  exercise: string;
  sets: number;
  reps: number;
  weightKg: number;
  rpe?: number | null;
}
interface ParsedWorkout {
  /** YYYY-MM-DD, resolved by the model from relative phrases. */
  date: string;
  templateName: string | null;
  entries: ParsedSet[];
}

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    const userId = getCurrentUserId();
    const todayStr = new Date().toISOString().slice(0, 10);

    // Library names help the model normalize nicknames → canonical names.
    const library = await prisma.exercise.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      select: { id: true, name: true, muscleGroup: true },
    });

    const client = new Anthropic();
    const resp = await withAnthropicRetry(() =>
      client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: `Parse this workout log into JSON. Today's date: ${todayStr}.

Exercise library (match to these canonical names when the text plausibly refers to them, e.g. "bulgarians" → "Bulgarian Split Squat", "RDLs" → "Romanian Deadlift"; otherwise keep the user's name in Title Case):
${library.map((e) => e.name).join(", ")}

Rules:
- Resolve relative dates ("two days ago", "yesterday") against today's date; default to today.
- Weights: assume kg unless "lb" stated (convert lb→kg, 1 decimal).
- "3x8 @25" = 3 sets of 8 reps at 25kg. A bare weight with no reps: use reps=null→skip that entry.
- templateName: short session label from context ("Legs", "Push", "Pull") or null.
- Respond with ONLY the JSON, no prose:
{"date":"YYYY-MM-DD","templateName":string|null,"entries":[{"exercise":string,"sets":n,"reps":n,"weightKg":n,"rpe":n|null}]}

Workout log: ${text.trim()}`,
          },
        ],
      }),
    );

    const raw = resp.content[0]?.type === "text" ? resp.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not parse workout text" }, { status: 422 });
    }
    const parsed: ParsedWorkout = JSON.parse(jsonMatch[0]);
    if (!parsed.entries?.length) {
      return NextResponse.json({ error: "No exercises found in that text" }, { status: 422 });
    }

    // Resolve/create exercises.
    const byLower = new Map(library.map((e) => [e.name.toLowerCase(), e]));
    const resolved: { exerciseId: string; name: string; p: ParsedSet }[] = [];
    for (const entry of parsed.entries) {
      const name = entry.exercise.trim();
      let ex = byLower.get(name.toLowerCase());
      if (!ex) {
        const created = await prisma.exercise.create({
          data: {
            userId,
            name,
            muscleGroup: "core", // placeholder; user can edit — model rarely needs this path
            movementPattern: "isolation",
            equipment: "bodyweight",
          },
          select: { id: true, name: true, muscleGroup: true },
        });
        byLower.set(created.name.toLowerCase(), created);
        ex = created;
      }
      resolved.push({ exerciseId: ex.id, name: ex.name, p: entry });
    }

    const date = new Date(`${parsed.date}T00:00:00.000Z`);
    const sessionVolume = resolved.reduce(
      (sum, r) => sum + r.p.sets * r.p.reps * r.p.weightKg,
      0,
    );

    const session = await prisma.workoutSession.create({
      data: {
        userId,
        date,
        completedAt: new Date(),
        templateName: parsed.templateName,
        sessionVolume,
        notes: `Quick-logged: "${text.trim().slice(0, 200)}"`,
        sets: {
          create: resolved.flatMap((r) =>
            Array.from({ length: r.p.sets }, (_, i) => ({
              userId,
              exerciseId: r.exerciseId,
              setNumber: i + 1,
              reps: r.p.reps,
              weight: r.p.weightKg,
              rpe: r.p.rpe ?? null,
            })),
          ),
        },
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      date: parsed.date,
      templateName: parsed.templateName,
      summary: resolved.map((r) => ({
        exercise: r.name,
        sets: r.p.sets,
        reps: r.p.reps,
        weightKg: r.p.weightKg,
      })),
    });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
