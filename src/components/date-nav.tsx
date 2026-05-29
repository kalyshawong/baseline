"use client";

import { useRouter, useSearchParams } from "next/navigation";

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .toUpperCase();
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
    <div className="flex items-center gap-4">
      <button
        onClick={() => navigate(shiftDate(currentDate, -1))}
        className="angled-clip-sm flex h-8 w-8 flex-none items-center justify-center bg-[var(--color-surface-2)] text-[var(--color-text-muted)] transition duration-150 ease-out-strong hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
        aria-label="Previous day"
      >
        <span className="text-[15px]">&lsaquo;</span>
      </button>
      <div className="text-center">
        <span className="disp text-[22px] tracking-[0.03em]">
          {formatDisplayDate(currentDate)}
        </span>
        {!isToday && (
          <button
            onClick={() => navigate(todayStr())}
            className="linklike ml-4"
          >
            Today
          </button>
        )}
      </div>
      <button
        onClick={() => navigate(shiftDate(currentDate, 1))}
        disabled={isToday}
        className="angled-clip-sm flex h-8 w-8 flex-none items-center justify-center bg-[var(--color-surface-2)] text-[var(--color-text-muted)] transition duration-150 ease-out-strong hover:bg-[var(--color-border)] hover:text-[var(--color-text)] disabled:opacity-20"
        aria-label="Next day"
      >
        <span className="text-[15px]">&rsaquo;</span>
      </button>
    </div>
  );
}
