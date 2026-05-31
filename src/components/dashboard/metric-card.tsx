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
    <div className="card-enter panel p-[16px_18px]">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--color-faint)]">
        {label}
      </p>
      <p className="disp text-[40px] leading-[0.85] mt-[6px] num">
        {value ?? "—"}
        {unit && value != null && (
          <small className="ml-1 text-[13px] font-semibold text-[var(--color-faint)]" style={{ fontFamily: "var(--font-sans, 'Archivo', system-ui, sans-serif)" }}>
            {unit}
          </small>
        )}
      </p>
      {detail && (
        <p className="mt-[5px] text-[11.5px] text-[var(--color-faint)]">{detail}</p>
      )}
    </div>
  );
}
