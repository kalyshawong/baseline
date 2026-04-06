interface Props {
  caloriesIn: number | null;
  caloriesOut: number | null; // total calories burned (incl BMR) from Oura
  goal: string | null;
  goalCals: number | null; // target intake for the goal
}

function classifyBalance(
  net: number,
  goal: string
): { status: "green" | "yellow" | "red"; message: string } {
  // net = in - out. Positive = surplus, negative = deficit.
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
  // maintain
  if (Math.abs(net) < 200) return { status: "green", message: "Balanced" };
  return {
    status: "yellow",
    message: net > 0 ? `Surplus of ${Math.round(net)} kcal` : `Deficit of ${Math.round(-net)} kcal`,
  };
}

const statusStyles: Record<string, string> = {
  green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  yellow: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
  red: "border-red-500/30 bg-red-500/10 text-red-400",
};

export function CalorieBalanceCard({ caloriesIn, caloriesOut, goal, goalCals }: Props) {
  if (caloriesOut == null) {
    return null;
  }

  const cIn = caloriesIn ?? 0;
  const net = cIn - caloriesOut;
  const classification = classifyBalance(net, goal ?? "maintain");
  const style = statusStyles[classification.status];

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        Calorie Balance
      </h2>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">In</p>
          <p className="text-xl font-bold tabular-nums text-emerald-400">
            {Math.round(cIn)}
          </p>
          <p className="text-[10px] text-[var(--color-text-muted)]">nutrition</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">Out</p>
          <p className="text-xl font-bold tabular-nums text-amber-400">
            {Math.round(caloriesOut)}
          </p>
          <p className="text-[10px] text-[var(--color-text-muted)]">Oura total</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">Net</p>
          <p
            className={`text-xl font-bold tabular-nums ${
              net > 0 ? "text-emerald-400" : net < 0 ? "text-amber-400" : "text-white"
            }`}
          >
            {net > 0 ? "+" : ""}
            {Math.round(net)}
          </p>
          <p className="text-[10px] text-[var(--color-text-muted)]">
            {net > 0 ? "surplus" : net < 0 ? "deficit" : "balanced"}
          </p>
        </div>
      </div>

      <div className={`mt-3 rounded-lg border p-2.5 text-center text-xs ${style}`}>
        {classification.message}
        {goal && (
          <span className="ml-1 opacity-60">
            (goal: {goal}
            {goalCals && `, target ${goalCals} in`})
          </span>
        )}
      </div>
    </div>
  );
}
