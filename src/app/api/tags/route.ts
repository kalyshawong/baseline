import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const startDate = url.searchParams.get("start_date");
  const endDate = url.searchParams.get("end_date");
  const limit = parseInt(url.searchParams.get("limit") ?? "50");

  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  if (startDate || endDate) {
    where.timestamp = {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) }),
    };
  }

  const tags = await prisma.activityTag.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: limit,
    include: { experiment: { select: { id: true, title: true } } },
  });

  return NextResponse.json(tags);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tag, category, metadata, experimentId, timestamp } = body;

  if (!tag || !category) {
    return NextResponse.json({ error: "tag and category are required" }, { status: 400 });
  }

  const validCategories = [
    "music", "breathing", "caffeine", "alcohol",
    "meditation", "exercise", "social", "study", "nutrition", "custom",
  ];
  if (!validCategories.includes(category)) {
    return NextResponse.json({ error: `Invalid category. Must be one of: ${validCategories.join(", ")}` }, { status: 400 });
  }

  const created = await prisma.activityTag.create({
    data: {
      tag,
      category,
      metadata: metadata ? JSON.stringify(metadata) : null,
      experimentId: experimentId ?? null,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    },
  });

  return NextResponse.json(created, { status: 201 });
}
