const phaseConfig: Record<
  string,
  { label: string; color: string; dot: string }
> = {
  menstrual:  { label: "MENSTRUAL",  color: "text-[var(--color-red)]",    dot: "bg-[var(--color-red)]" },
  follicular: { label: "FOLLICULAR", color: "text-[var(--color-green)]",  dot: "bg-[var(--color-green)]" },
  ovulation:  { label: "OVULATION",  color: "text-[var(--color-yellow)]", dot: "bg-[var(--color-yellow)]" },
  luteal:     { label: "LUTEAL",     color: "text-[var(--color-blue)]",   dot: "bg-[var(--color-blue)]" },
};

interface Props {
  phase: string | null;
  dayNumber: number | null;
  temperatureDeviationC?: number | null;
}

export function CycleCard({ phase, dayNumber, temperatureDeviationC }: Props) {
  const config = phase ? phaseConfig[phase] : null;
  const tempColor =
    temperatureDeviationC == null
      ? "text-[var(--color-text)]"
      : temperatureDeviationC > 0.05
        ? "text-[var(--color-yellow)]"
        : temperatureDeviationC < -0.05
          ? "text-[var(--color-blue)]"
          : "text-[var(--color-text)]";
  const tempLabel =
    temperatureDeviationC != null
      ? `${temperatureDeviationC > 0 ? "+" : ""}${temperatureDeviationC.toFixed(2)}°`
      : null;

  return (
    <div className="panel">
      <div className="ov mb-4">Cycle</div>

      {config ? (
        <>
          <div className={`flex items-center gap-2.5 disp text-[40px] leading-[0.85] ${config.color}`}>
            <span
              className={`h-[11px] w-[11px] ${config.dot}`}
              style={{ clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)" }}
              aria-hidden
            />
            {config.label}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {dayNumber != null && (
              <div>
                <div className="ov">Day</div>
                <div className="disp num text-[44px] leading-[0.85]">{dayNumber}</div>
              </div>
            )}
            {tempLabel != null && (
              <div>
                <div className="ov">Temp</div>
                <div className={`disp num text-[44px] leading-[0.85] ${tempColor}`}>{tempLabel}</div>
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          No recent cycle data.
        </p>
      )}
    </div>
  );
}
