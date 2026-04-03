interface EnvData {
  pm25: number | null;
  temperature: number | null;
  humidity: number | null;
  noiseDb: number | null;
  timestamp: string;
}

function quality(pm25: number): { label: string; color: string } {
  if (pm25 <= 12) return { label: "Good", color: "text-emerald-400" };
  if (pm25 <= 25) return { label: "Moderate", color: "text-yellow-400" };
  return { label: "Poor", color: "text-red-400" };
}

export function EnvCard({ latest }: { latest: EnvData | null }) {
  if (!latest) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center text-sm text-[var(--color-text-muted)]">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wider">
          Environment
        </h2>
        <p>No sensor data yet. Connect your ESP32 to start logging.</p>
      </div>
    );
  }

  const aq = latest.pm25 != null ? quality(latest.pm25) : null;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Environment
        </h2>
        <span className="text-xs text-[var(--color-text-muted)]">
          {new Date(latest.timestamp).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">PM2.5</p>
          <p className="text-lg font-bold tabular-nums">
            {latest.pm25 != null ? latest.pm25.toFixed(1) : "—"}
            {latest.pm25 != null && (
              <span className="text-xs font-normal text-[var(--color-text-muted)]"> µg/m³</span>
            )}
          </p>
          {aq && <p className={`text-xs ${aq.color}`}>{aq.label}</p>}
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">Temp</p>
          <p className="text-lg font-bold tabular-nums">
            {latest.temperature != null ? `${latest.temperature.toFixed(1)}°C` : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">Humidity</p>
          <p className="text-lg font-bold tabular-nums">
            {latest.humidity != null ? `${latest.humidity.toFixed(0)}%` : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">Noise</p>
          <p className="text-lg font-bold tabular-nums">
            {latest.noiseDb != null ? `${latest.noiseDb.toFixed(0)} dB` : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
