interface Props {
  caloriesIn: number | null;
  caloriesOut: number | null;
  goal: string | null;
  goalCals: number | null;
}

function classifyBalance(
  net: number,
  goal: string
): { status: "green" | "yellow" | "red"; message: string } {
  if (goal === "lose") {
    if (net > 100) return { status: "red", message: "Surplus — goal is cut" };
    if (net > -200) return { status: "yellow", message: "Slight deficit" };
    if (net > -700) return { status: "green", message: "In target deficit range" };
    return { status: "yellow", message: "Large deficit — watch recovery" };
  }
  if (goal === "gain") {
    if (net < -100) return { status: "red", message: "Deficit — goal is gain" };
    if (net < 150) return { status: "yellow", message: "Near maintenance" };
    if (net < 500) return { status: "green", message: "In target surplus range" };
    return { status: "yellow", message: "Large surplus" };
  }
  if (Math.abs(net) < 200) return { status: "green", message: "Balanced" };
  return {
    status: "yellow",
    message: net > 0 ? `Surplus of ${Math.round(net)} kcal` : `Deficit of ${Math.round(-net)} kcal`,
  };
}

const barClass: Record<string, string> = {
  green: "bg-[var(--color-green)]",
  yellow: "bg-[var(--color-yellow)]",
  red: "bg-[var(--color-red)]",
};

export function CalorieBalanceCard({ caloriesIn, caloriesOut, goal }: Props) {
  if (caloriesOut == null) return null;

  const cIn = caloriesIn ?? 0;
  const net = cIn - caloriesOut;
  const classification = classifyBalance(net, goal ?? "maintain");

  return (
    <div className="panel">
      <div className="ov mb-4">Calories</div>

      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-[var(--color-surface-2)] p-3 text-center">
          <div className="ov">In</div>
          <div className="disp num text-[40px] leading-[0.9] text-[var(--color-green)]">
            {Math.round(cIn)}
          </div>
        </div>
        <div className="bg-[var(--color-surface-2)] p-3 text-center">
          <div className="ov">Out</div>
          <div className="disp num text-[40px] leading-[0.9] text-[var(--color-yellow)]">
            {Math.round(caloriesOut)}
          </div>
        </div>
        <div className="bg-[var(--color-surface-2)] p-3 text-center">
          <div className="ov">Net</div>
          <div className={`disp num text-[40px] leading-[0.9] ${
            net > 0 ? "text-[var(--color-green)]" : net < 0 ? "text-[var(--color-yellow)]" : "text-[var(--color-text)]"
          }`}>
            {net > 0 ? "+" : ""}{Math.round(net)}
          </div>
        </div>
      </div>

      <div className={`mt-3 ${barClass[classification.status]} py-2.5 text-center text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-bg)] angled-clip`}>
        {classification.message}
      </div>
    </div>
  );
}
