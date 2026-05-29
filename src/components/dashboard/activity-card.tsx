interface ActivityData {
  totalCalories: number | null;
  activeCalories: number | null;
  steps: number | null;
  highActivityTime: number | null;
  mediumActivityTime: number | null;
}

interface SyncData {
  syncedAt: string;
  status: string;
}

/** Lightweight summary of ambient activities (walks, stands, etc.)
 *  that shouldn't earn their own WorkoutCard. Each entry stays
 *  individually addressable but we render them as one rolled-up
 *  line, not three repeated cards. */
interface AmbientSession {
  id: string;
  name: string;
  durationSeconds: number;
  activeCalories: number | null;
}

interface ActivityCardProps {
  activity: ActivityData | null;
  lastHkSync: SyncData | null;
  lastOuraSync: Date | null;
  /** Walks / breathing / other low-intensity sessions for the day.
   *  Rendered as one summary line, not individual cards. */
  ambientSessions?: AmbientSession[];
}

/**
 * Ambient daily activity totals from Oura — total burn, active calories,
 * steps, active time. The specific workout (Apple Watch / HealthKit) used
 * to live nested inside this card; it now lives in WorkoutCard so each
 * concept has its own card-level treatment. ActivityCard is the
 * "what your body did across the whole day" card.
 */

function formatMinutes(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

const statusDot: Record<string, string> = {
  success: "bg-[var(--color-green)]",
  partial: "bg-[var(--color-yellow)]",
  failed: "bg-red-400",
};

function mostRecentTimestamp(
  lastOuraSync: Date | null,
  lastHkSync: SyncData | null,
): { time: string; dotClass: string } | null {
  const candidates: { date: Date; dotClass: string }[] = [];
  if (lastOuraSync) {
    candidates.push({ date: lastOuraSync, dotClass: "bg-[var(--color-green)]" });
  }
  if (lastHkSync) {
    candidates.push({
      date: new Date(lastHkSync.syncedAt),
      dotClass: statusDot[lastHkSync.status] ?? "bg-neutral-400",
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.date.getTime() - a.date.getTime());
  return { time: formatTime(candidates[0].date), dotClass: candidates[0].dotClass };
}

export function ActivityCard({ activity, lastHkSync, lastOuraSync, ambientSessions = [] }: ActivityCardProps) {
  const ts = mostRecentTimestamp(lastOuraSync, lastHkSync);

  const hasOuraData = !!activity;
  const activeTime = hasOuraData
    ? (activity.highActivityTime ?? 0) + (activity.mediumActivityTime ?? 0)
    : null;

  return (
    <div className="panel p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="ov">Activity</h2>
        {ts && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            <span className={`h-1.5 w-1.5 rounded-full ${ts.dotClass}`} />
            {ts.time}
          </div>
        )}
      </div>

      {/* Oura daily totals */}
      {hasOuraData ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="ov">Total burn</p>
            <p className="disp num text-[42px] leading-[0.85]">
              {activity.totalCalories ?? "—"}
              {activity.totalCalories != null && (
                <span className="ml-1 text-xs font-normal text-[var(--color-text-muted)]">cal</span>
              )}
            </p>
          </div>
          <div>
            <p className="ov">Active</p>
            <p className="disp num text-[42px] leading-[0.85]">
              {activity.activeCalories ?? "—"}
              {activity.activeCalories != null && (
                <span className="ml-1 text-xs font-normal text-[var(--color-text-muted)]">cal</span>
              )}
            </p>
          </div>
          <div>
            <p className="ov">Steps</p>
            <p className="disp num text-[42px] leading-[0.85]">
              {activity.steps != null ? activity.steps.toLocaleString() : "—"}
            </p>
          </div>
          <div>
            <p className="ov">Active time</p>
            <p className="disp num text-[42px] leading-[0.85]">
              {formatMinutes(activeTime)}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          Oura publishes daily totals at end of day.
        </p>
      )}

      {/* Ambient sessions — walks etc. that aren't real training. One
       * summary line: "Walks: 3 sessions · 1h 33m · 178 cal." Each
       * individual session is still in HealthKitWorkout if the user
       * wants to query it directly via /coach. */}
      {ambientSessions.length > 0 && (
        <p className="text-xs font-semibold text-[var(--color-faint)] mt-4 pt-3 border-t border-[var(--color-border)] tracking-[0.03em] uppercase">
          {summarizeAmbient(ambientSessions)}
        </p>
      )}
    </div>
  );
}

function summarizeAmbient(sessions: AmbientSession[]): string {
  // Group by name (e.g. all "walking" together). For a single-name
  // case the label is just the name; mixed names get "Activity"
  // as a generic header.
  const totalSec = sessions.reduce((sum, s) => sum + s.durationSeconds, 0);
  const totalCal = sessions.reduce(
    (sum, s) => sum + (s.activeCalories ?? 0),
    0,
  );
  const uniqueNames = Array.from(
    new Set(sessions.map((s) => s.name.toLowerCase())),
  );
  // Smarter pluralizer than naive +"s" so "walking" → "Walks", not
  // "Walkings." For each known ambient name, map to its plural noun.
  const PLURAL_LABELS: Record<string, string> = {
    walking: "Walks",
    walk: "Walks",
    stand: "Stands",
    breathing: "Breathing sessions",
    meditation: "Meditations",
  };
  const label =
    uniqueNames.length === 1
      ? PLURAL_LABELS[uniqueNames[0]] ??
        uniqueNames[0].charAt(0).toUpperCase() + uniqueNames[0].slice(1) + "s"
      : "Activity";
  const durStr = formatMinutes(totalSec);
  const calStr = totalCal > 0 ? ` · ${Math.round(totalCal)} cal` : "";
  return `${label}: ${sessions.length} ${sessions.length === 1 ? "session" : "sessions"} · ${durStr}${calStr}`;
}
