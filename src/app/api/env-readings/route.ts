import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, parseIntInRange } from "@/lib/utils";

// Sensor reading bounds — anything outside is either a wiring fault or a
// malicious payload. Tight enough to flag bad data, loose enough to never
// reject a real-world reading.
const PM25_MIN = 0;        // µg/m³
const PM25_MAX = 1000;     // wildfire ceiling well above any indoor value
const TEMP_MIN_C = -40;    // sensor spec floor
const TEMP_MAX_C = 85;     // BME280 spec ceiling
const HUMIDITY_MIN = 0;    // %
const HUMIDITY_MAX = 100;
const PRESSURE_MIN = 300;  // hPa, near top of Everest
const PRESSURE_MAX = 1100; // hPa, near deep-mine ceiling
const NOISE_MIN_DB = 0;
const NOISE_MAX_DB = 200;  // jet engine ≈140
const LUX_MIN = 0;
const LUX_MAX = 200_000;   // direct sunlight ≈100k
const DEVICE_ID_MAX_LEN = 64;

function isValidNumberInRange(v: unknown, min: number, max: number): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

function validateOptionalNumber(
  value: unknown,
  field: string,
  min: number,
  max: number
): string | null {
  if (value == null) return null;
  if (!isValidNumberInRange(value, min, max)) {
    return `${field} must be a number between ${min} and ${max}`;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
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

    // Validate timestamp is a parseable date
    const ts = new Date(timestamp);
    if (Number.isNaN(ts.getTime())) {
      return NextResponse.json(
        { error: "timestamp must be a valid ISO date string" },
        { status: 400 }
      );
    }

    if (device_id != null) {
      if (typeof device_id !== "string" || device_id.length > DEVICE_ID_MAX_LEN) {
        return NextResponse.json(
          { error: `device_id must be a string ≤${DEVICE_ID_MAX_LEN} chars` },
          { status: 400 }
        );
      }
    }

    const validationErrors = [
      validateOptionalNumber(pm25, "pm25", PM25_MIN, PM25_MAX),
      validateOptionalNumber(temperature, "temperature", TEMP_MIN_C, TEMP_MAX_C),
      validateOptionalNumber(humidity, "humidity", HUMIDITY_MIN, HUMIDITY_MAX),
      validateOptionalNumber(pressure, "pressure", PRESSURE_MIN, PRESSURE_MAX),
      validateOptionalNumber(noise_db, "noise_db", NOISE_MIN_DB, NOISE_MAX_DB),
      validateOptionalNumber(lux, "lux", LUX_MIN, LUX_MAX),
    ].filter((e): e is string => e != null);

    if (validationErrors.length > 0) {
      return NextResponse.json({ error: validationErrors.join("; ") }, { status: 400 });
    }

    const reading = await prisma.envReading.create({
      data: {
        deviceId: device_id ?? "env-sensor-bedroom",
        timestamp: ts,
        pm25: pm25 ?? null,
        temperature: temperature ?? null,
        humidity: humidity ?? null,
        pressure: pressure ?? null,
        noiseDb: noise_db ?? null,
        lux: lux ?? null,
      },
    });

    return NextResponse.json(reading, { status: 201 });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    // 1 hour to 30 days (720 hours)
    const hours = parseIntInRange(url.searchParams.get("hours"), 24, 1, 720);

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const readings = await prisma.envReading.findMany({
      where: { timestamp: { gte: since } },
      orderBy: { timestamp: "desc" },
    });

    return NextResponse.json(readings);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
