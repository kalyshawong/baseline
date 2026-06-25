import type { ReactNode } from "react";

/**
 * Mobile metric tile — the design's .mcard (mobile-sized display font that fits
 * the 2-up / 3-up grids without forcing the column wider than the viewport).
 */
export function MCard({
  label,
  value,
  unit,
  detail,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  detail?: ReactNode;
}) {
  const hasValue = value != null && value !== "—";
  return (
    <div className="mcard">
      <div className="k">{label}</div>
      <div className="v num">
        {value ?? "—"}
        {unit && hasValue && <small> {unit}</small>}
      </div>
      {detail && <div className="t">{detail}</div>}
    </div>
  );
}
