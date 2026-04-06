"use client";

import { useRouter, useSearchParams } from "next/navigation";

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00"); // noon to avoid timezone shift
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DateNav({ basePath }: { basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentDate = searchParams.get("date") ?? todayStr();
  const isToday = currentDate === todayStr();

  function navigate(dateStr: string) {
    const today = todayStr();
    if (dateStr === today) {
      router.push(basePath);
    } else {
      router.push(`${basePath}?date=${dateStr}`);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => navigate(shiftDate(currentDate, -1))}
        className="rounded-lg bg-white/10 px-2.5 py-1.5 text-sm transition-colors hover:bg-white/20"
        aria-label="Previous day"
      >
        &larr;
      </button>
      <div className="text-center">
        <p className="text-sm text-[var(--color-text-muted)]">
          {formatDisplayDate(currentDate)}
        </p>
        {!isToday && (
          <button
            onClick={() => navigate(todayStr())}
            className="text-xs text-[var(--color-text-muted)] underline hover:text-white"
          >
            Back to today
          </button>
        )}
      </div>
      <button
        onClick={() => navigate(shiftDate(currentDate, 1))}
        disabled={isToday}
        className="rounded-lg bg-white/10 px-2.5 py-1.5 text-sm transition-colors hover:bg-white/20 disabled:opacity-20"
        aria-label="Next day"
      >
        &rarr;
      </button>
    </div>
  );
}

