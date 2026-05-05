import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/utils";

const VALID_CATEGORIES = [
  "relationship",
  "sleep",
  "stressor",
  "effort",
  "milestone",
  "illness",
  "travel",
  "cycle",
  "custom",
];

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const includeArchived = url.searchParams.get("include_archived") === "1";

    const defs = await prisma.lifeContextDef.findMany({
      where: includeArchived ? {} : { archived: false },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(defs);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { label, category, emoji, color } = body;

    if (!label || typeof label !== "string" || !label.trim()) {
      return NextResponse.json({ error: "label is required" }, { status: 400 });
    }

    const cat = typeof category === "string" && VALID_CATEGORIES.includes(category)
      ? category
      : "custom";

    const created = await prisma.lifeContextDef.create({
      data: {
        label: label.trim(),
        category: cat,
        emoji: typeof emoji === "string" && emoji.length > 0 ? emoji.slice(0, 4) : null,
        color: typeof color === "string" && color.length > 0 ? color : null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, label, emoji, color, category } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};

    if (label !== undefined) {
      if (typeof label !== "string" || !label.trim()) {
        return NextResponse.json({ error: "label must be a non-empty string" }, { status: 400 });
      }
      data.label = label.trim();
    }

    if (category !== undefined) {
      if (typeof category !== "string" || !VALID_CATEGORIES.includes(category)) {
        return NextResponse.json(
          { error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` },
          { status: 400 },
        );
      }
      data.category = category;
    }

    if (emoji !== undefined) {
      data.emoji = typeof emoji === "string" && emoji.length > 0 ? emoji.slice(0, 4) : null;
    }

    if (color !== undefined) {
      data.color = typeof color === "string" && color.length > 0 ? color : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const updated = await prisma.lifeContextDef.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A flag with that name already exists" },
        { status: 409 },
      );
    }
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, hard } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    if (hard === true) {
      // Cascades to LifeContextLog rows
      await prisma.lifeContextDef.delete({ where: { id } });
    } else {
      // Soft-archive: hides from quick-toggle UI but preserves history
      await prisma.lifeContextDef.update({
        where: { id },
        data: { archived: true },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
