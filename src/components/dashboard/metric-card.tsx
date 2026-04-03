export function MetricCard({
  label,
  value,
  unit,
  detail,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">
        {value ?? "—"}
        {unit && value != null && (
          <span className="ml-1 text-sm font-normal text-[var(--color-text-muted)]">
            {unit}
          </span>
        )}
      </p>
      {detail && (
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{detail}</p>
      )}
    </div>
  );
}
