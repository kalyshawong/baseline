import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const sensorKey = process.env.SENSOR_API_KEY;

  if (sensorKey && authHeader !== `Bearer ${sensorKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { device_id, timestamp, pm25, temperature, humidity, pressure, noise_db, lux } = body;

  if (!timestamp) {
    return NextResponse.json({ error: "timestamp is required" }, { status: 400 });
  }

  const reading = await prisma.envReading.create({
    data: {
      deviceId: device_id ?? "env-sensor-bedroom",
      timestamp: new Date(timestamp),
      pm25: pm25 ?? null,
      temperature: temperature ?? null,
      humidity: humidity ?? null,
      pressure: pressure ?? null,
      noiseDb: noise_db ?? null,
      lux: lux ?? null,
    },
  });

  return NextResponse.json(reading, { status: 201 });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const hours = parseInt(url.searchParams.get("hours") ?? "24");

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const readings = await prisma.envReading.findMany({
    where: { timestamp: { gte: since } },
    orderBy: { timestamp: "desc" },
  });

  return NextResponse.json(readings);
}
