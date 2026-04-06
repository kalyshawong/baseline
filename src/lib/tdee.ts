/**
 * TDEE (Total Daily Energy Expenditure) calculations.
 * Research: Mifflin-St Jeor formula is the most accurate for general populations.
 */

export interface ProfileData {
  weightKg: number;
  heightCm: number | null;
  age: number | null;
  sex: string | null; // female | male
  activityLevel: string; // sedentary | light | moderate | active | very_active
  goal: string; // lose | maintain | gain
  targetWeightKg: number | null;
}

const activityMultipliers: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function activityLabel(level: string): string {
  switch (level) {
    case "sedentary":
      return "Sedentary (desk job, no exercise)";
    case "light":
      return "Light (1-3 sessions/wk)";
    case "moderate":
      return "Moderate (3-5 sessions/wk)";
    case "active":
      return "Active (6-7 sessions/wk)";
    case "very_active":
      return "Very active (2x/day or physical job)";
    default:
      return level;
  }
}

// Mifflin-St Jeor BMR
export function basalMetabolicRate(weightKg: number, heightCm: number, age: number, sex: string): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

// TDEE = BMR × activity multiplier
export function totalDailyEnergyExpenditure(profile: ProfileData): number | null {
  if (!profile.heightCm || !profile.age || !profile.sex) {
    // Fallback: crude estimate if height/age/sex missing
    // 14 kcal/lb for active women, 15 for active men — approximate
    const perKg = profile.sex === "male" ? 33 : 30;
    const multiplier = activityMultipliers[profile.activityLevel] ?? 1.55;
    return Math.round(profile.weightKg * perKg * (multiplier / 1.55));
  }
  const bmr = basalMetabolicRate(
    profile.weightKg,
    profile.heightCm,
    profile.age,
    profile.sex
  );
  const multiplier = activityMultipliers[profile.activityLevel] ?? 1.55;
  return Math.round(bmr * multiplier);
}

// Goal-adjusted calorie target
export function goalCalories(tdee: number, goal: string): number {
  switch (goal) {
    case "lose":
      return tdee - 500; // ~1 lb/wk deficit
    case "gain":
      return tdee + 300; // lean bulk surplus
    default:
      return tdee;
  }
}

// Compare actual vs goal intake with trend context
export interface CalorieFlag {
  status: "on_target" | "under" | "over" | "deficit_mismatch" | "surplus_mismatch";
  message: string;
  deltaCalories: number; // actual - goal
}

export function calorieFlag(
  actualCalories: number,
  goalCals: number,
  weightTrend: "up" | "down" | "flat" | null,
  goal: string
): CalorieFlag {
  const delta = actualCalories - goalCals;

  // Big mismatch: weight going wrong direction vs goal
  if (goal === "lose" && weightTrend === "up") {
    return {
      status: "surplus_mismatch",
      message: "Weight is trending up but goal is cut — surplus detected. Reduce intake or increase activity.",
      deltaCalories: delta,
    };
  }
  if ((goal === "maintain" || goal === "gain") && weightTrend === "down") {
    return {
      status: "deficit_mismatch",
      message: `Weight is trending down but goal is ${goal}. Add ${Math.abs(delta) > 0 ? Math.round(Math.abs(delta)) : 300}-500 kcal/day.`,
      deltaCalories: delta,
    };
  }

  // Regular under/over
  if (Math.abs(delta) < 150) {
    return { status: "on_target", message: "On target for your goal.", deltaCalories: delta };
  }
  if (delta < 0) {
    return {
      status: "under",
      message: `${Math.abs(Math.round(delta))} kcal under target.`,
      deltaCalories: delta,
    };
  }
  return {
    status: "over",
    message: `${Math.round(delta)} kcal over target.`,
    deltaCalories: delta,
  };
}

// 7-day moving average for weight trend smoothing
export function movingAverage(values: Array<{ date: string; weight: number }>, window = 7): Array<{ date: string; weight: number; avg: number | null }> {
  return values.map((v, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    if (slice.length < Math.min(window, 3)) {
      return { ...v, avg: null };
    }
    const avg = slice.reduce((s, x) => s + x.weight, 0) / slice.length;
    return { ...v, avg: Math.round(avg * 10) / 10 };
  });
}

// Determine trend from last 7 vs prior 7 days
export function weightTrendDirection(logs: Array<{ day: Date; weightKg: number }>): "up" | "down" | "flat" | null {
  if (logs.length < 4) return null;
  const sorted = [...logs].sort((a, b) => a.day.getTime() - b.day.getTime());
  const recent = sorted.slice(-7);
  const prior = sorted.slice(-14, -7);
  if (prior.length < 3) return null;

  const recentAvg = recent.reduce((s, l) => s + l.weightKg, 0) / recent.length;
  const priorAvg = prior.reduce((s, l) => s + l.weightKg, 0) / prior.length;
  const delta = recentAvg - priorAvg;

  if (Math.abs(delta) < 0.2) return "flat"; // < 200g change
  return delta > 0 ? "up" : "down";
}

// Unit conversions
export function kgToLb(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

export function lbToKg(lb: number): number {
  return Math.round((lb / 2.20462) * 10) / 10;
}
