/**
 * Environment card — ESP32 sensor data.
 * Design ref: Baseline Mind.html → .ftiles .panel
 */

interface EnvData {
  pm25: number | null;
  temperature: number | null;
  humidity: number | null;
  noiseDb: number | null;
  timestamp: string;
}

function quality(pm25: number): { label: string; color: string } {
  if (pm25 <= 12) return { label: "Good", color: "var(--color-green)" };
  if (pm25 <= 25) return { label: "Moderate", color: "var(--color-yellow)" };
  return { label: "Poor", color: "var(--color-red)" };
}

export function EnvCard({ latest }: { latest: EnvData | null }) {
  if (!latest) {
    return (
      <div className="panel">
        <p className="ov mb-3">Environment</p>
        <p className="text-sm text-[var(--color-text-muted)]">
          No sensor data yet. Connect your ESP32.
        </p>
      </div>
    );
  }

  const aq = latest.pm25 != null ? quality(latest.pm25) : null;

  return (
    <div className="panel">
      <div className="flex items-center justify-between mb-3">
        <p className="ov">Environment</p>
        <span className="text-xs text-[var(--color-faint)]">
          {new Date(latest.timestamp).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--color-faint)]">PM2.5</p>
          <p className="disp num text-[24px] leading-none mt-1">
            {latest.pm25 != null ? latest.pm25.toFixed(1) : "—"}
            {latest.pm25 != null && (
              <small className="text-[11px] font-semibold text-[var(--color-faint)]" style={{ fontFamily: "var(--font-sans, 'Archivo', system-ui, sans-serif)" }}> µg/m³</small>
            )}
          </p>
          {aq && <p className="text-xs mt-0.5" style={{ color: aq.color }}>{aq.label}</p>}
        </div>
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--color-faint)]">Temp</p>
          <p className="disp num text-[24px] leading-none mt-1">
            {latest.temperature != null ? `${latest.temperature.toFixed(1)}°C` : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--color-faint)]">Humidity</p>
          <p className="disp num text-[24px] leading-none mt-1">
            {latest.humidity != null ? `${latest.humidity.toFixed(0)}%` : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--color-faint)]">Noise</p>
          <p className="disp num text-[24px] leading-none mt-1">
            {latest.noiseDb != null ? `${latest.noiseDb.toFixed(0)} dB` : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
