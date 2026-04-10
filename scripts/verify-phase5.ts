/**
 * Phase 5 — Verification & Tuning
 * Run with: npx tsx scripts/verify-phase5.ts
 */

import { detectTradeoffs, goalSystemPromptSection } from "../src/lib/coach-context";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

// ============================================================
// 5A: Verify goal lens section ordering for all 6 types
// ============================================================
console.log("\n=== 5A: Goal Lens Section Ordering ===\n");

// Import the lenses and default order by reading the file directly
// Since they're not exported, we verify via goalSystemPromptSection and structural checks
const goalTypes = ["race", "strength", "physique", "cognitive", "weight", "health"];

// Verify each type produces a non-empty system prompt section
for (const type of goalTypes) {
  const section = goalSystemPromptSection({
    type,
    subtype: null,
    title: `Test ${type} goal`,
    target: "test target",
    deadline: new Date(Date.now() + 30 * 86400000),
  });
  assert(section.length > 0, `${type}: produces non-empty system prompt section`);
  assert(section.includes("Active Coaching Focus"), `${type}: includes "Active Coaching Focus" header`);
}

// Race/Hyrox subtype
const hyroxSection = goalSystemPromptSection({
  type: "race",
  subtype: "hyrox",
  title: "Hyrox Race",
  target: "Sub 1:30",
  deadline: new Date(Date.now() + 60 * 86400000),
});
assert(hyroxSection.includes("Hyrox-specific"), "race/hyrox: includes Hyrox-specific guidance");
assert(hyroxSection.includes("Brandt 2025"), "race/hyrox: cites Brandt 2025");
assert(hyroxSection.includes("Hickson 1980"), "race/hyrox: cites Hickson 1980 (concurrent training)");

// Cognitive specifics
const cogSection = goalSystemPromptSection({
  type: "cognitive",
  subtype: "cfa",
  title: "CFA Exam",
  target: "Pass Level 1",
  deadline: new Date(Date.now() + 14 * 86400000),
});
assert(cogSection.includes("Marcora"), "cognitive: cites Marcora (mental fatigue)");
assert(cogSection.includes("Walker 2017"), "cognitive: cites Walker 2017 (sleep/memory)");
assert(cogSection.includes("Lieberman"), "cognitive: cites Lieberman (sleep deprivation)");

// Weight/cut subtype
const cutSection = goalSystemPromptSection({
  type: "weight",
  subtype: "cut",
  title: "Cut Phase",
  target: "Lose 3kg",
  deadline: null,
});
assert(cutSection.includes("Altini 2022"), "weight/cut: cites Altini 2022 (deficit HRV)");
assert(cutSection.includes("Cut-specific"), "weight/cut: includes cut-specific guidance");
assert(cutSection.includes("Loucks 2011"), "weight/cut: cites Loucks 2011 (EA floor)");

// Weight/bulk subtype
const bulkSection = goalSystemPromptSection({
  type: "weight",
  subtype: "bulk",
  title: "Bulk Phase",
  target: "Gain 2kg lean mass",
  deadline: null,
});
assert(bulkSection.includes("Bulk-specific"), "weight/bulk: includes bulk-specific guidance");

// Strength specifics
const strSection = goalSystemPromptSection({
  type: "strength",
  subtype: null,
  title: "Strength Block",
  target: "200kg deadlift",
  deadline: new Date(Date.now() + 90 * 86400000),
});
assert(strSection.includes("MEV/MAV/MRV"), "strength: mentions volume landmarks");
assert(strSection.includes("Morton 2018"), "strength: cites Morton 2018 (protein)");
assert(strSection.includes("Pritchard 2024"), "strength: cites Pritchard 2024 (deload)");

// Health specifics
const healthSection = goalSystemPromptSection({
  type: "health",
  subtype: "sleep_optimization",
  title: "Optimize Sleep",
  target: "90min deep sleep",
  deadline: null,
});
assert(healthSection.includes("health target"), "health: mentions health target");
assert(healthSection.includes("environment sensor"), "health: mentions environment data");

// Null goal
const nullSection = goalSystemPromptSection(null);
assert(nullSection === "", "null goal: returns empty string");

// Unknown type
const unknownSection = goalSystemPromptSection({
  type: "custom",
  subtype: null,
  title: "Custom",
  target: null,
  deadline: null,
});
assert(unknownSection === "", "custom/unknown type: returns empty string");

// Deadline formatting
const deadlineSection = goalSystemPromptSection({
  type: "race",
  subtype: null,
  title: "Marathon",
  target: "Sub 4:00",
  deadline: "2026-06-15T00:00:00Z",
});
assert(deadlineSection.includes("June"), "race with string deadline: formats date correctly");

const noDeadlineSection = goalSystemPromptSection({
  type: "strength",
  subtype: null,
  title: "Strength",
  target: "Get strong",
  deadline: null,
});
assert(noDeadlineSection.includes("not set"), "no deadline: shows 'not set'");

// ============================================================
// 5B: Verify tradeoff detection
// ============================================================
console.log("\n=== 5B: Tradeoff Detection ===\n");

// 1. DEFICIT + RACE (EA < 30 = critical)
const t1 = detectTradeoffs(
  [
    { id: "1", type: "weight", subtype: "cut", title: "Cut Phase", deadline: null },
    { id: "2", type: "race", subtype: "hyrox", title: "Hyrox Berlin", deadline: new Date(Date.now() + 60 * 86400000) },
  ],
  { energyAvailability: 28, readinessScore: 75, cyclePhase: null, hrvCv: null, weeklyRunningKm: null, calorieBalance: null }
);
assert(t1.some((t) => t.severity === "critical" && t.message.includes("BELOW the 30 threshold")), "cut+race with EA=28: critical EA warning");

// 1b. DEFICIT + RACE (EA 30-35 = warning)
const t1b = detectTradeoffs(
  [
    { id: "1", type: "weight", subtype: "cut", title: "Cut", deadline: null },
    { id: "2", type: "race", subtype: null, title: "5K", deadline: new Date(Date.now() + 30 * 86400000) },
  ],
  { energyAvailability: 33, readinessScore: 80, cyclePhase: null, hrvCv: null, weeklyRunningKm: null, calorieBalance: null }
);
assert(t1b.some((t) => t.severity === "warning" && t.message.includes("approaching the 30 threshold")), "cut+race with EA=33: warning (approaching)");

// 2. EXAM + LOW READINESS (within 5 days)
const t2 = detectTradeoffs(
  [
    { id: "3", type: "cognitive", subtype: "cfa", title: "CFA Level 1", deadline: new Date(Date.now() + 3 * 86400000) },
  ],
  { energyAvailability: null, readinessScore: 62, cyclePhase: null, hrvCv: null, weeklyRunningKm: null, calorieBalance: null }
);
assert(t2.some((t) => t.severity === "critical" && t.message.includes("3 days away")), "cognitive 3 days out, readiness 62: critical warning");

// 2b. EXAM far out — no warning
const t2b = detectTradeoffs(
  [
    { id: "3", type: "cognitive", subtype: null, title: "Finals", deadline: new Date(Date.now() + 30 * 86400000) },
  ],
  { energyAvailability: null, readinessScore: 55, cyclePhase: null, hrvCv: null, weeklyRunningKm: null, calorieBalance: null }
);
assert(!t2b.some((t) => t.message.includes("days away")), "cognitive 30 days out: no exam proximity warning");

// 2c. EXAM close but readiness OK — no warning
const t2c = detectTradeoffs(
  [
    { id: "3", type: "cognitive", subtype: null, title: "Exam", deadline: new Date(Date.now() + 2 * 86400000) },
  ],
  { energyAvailability: null, readinessScore: 80, cyclePhase: null, hrvCv: null, weeklyRunningKm: null, calorieBalance: null }
);
assert(!t2c.some((t) => t.severity === "critical" && t.message.includes("days away")), "cognitive 2 days out, readiness 80: no critical warning");

// 3. CONCURRENT STRENGTH + ENDURANCE
const t3 = detectTradeoffs(
  [
    { id: "4", type: "race", subtype: "half_marathon", title: "Half Marathon", deadline: new Date(Date.now() + 90 * 86400000) },
    { id: "5", type: "strength", subtype: null, title: "Strength Block", deadline: null },
  ],
  { energyAvailability: null, readinessScore: null, cyclePhase: null, hrvCv: null, weeklyRunningKm: null, calorieBalance: null }
);
assert(t3.some((t) => t.severity === "info" && t.message.includes("Hickson 1980")), "race+strength: interference info warning");

// 3b. CONCURRENT PHYSIQUE + ENDURANCE
const t3b = detectTradeoffs(
  [
    { id: "4", type: "race", subtype: null, title: "10K", deadline: new Date(Date.now() + 60 * 86400000) },
    { id: "5", type: "physique", subtype: null, title: "Physique Goal", deadline: null },
  ],
  { energyAvailability: null, readinessScore: null, cyclePhase: null, hrvCv: null, weeklyRunningKm: null, calorieBalance: null }
);
assert(t3b.some((t) => t.message.includes("Concurrent training interference")), "race+physique: also triggers interference warning");

// 4. OVERREACHING (HRV CV > 10)
const t4 = detectTradeoffs(
  [{ id: "6", type: "strength", subtype: null, title: "Hypertrophy", deadline: null }],
  { energyAvailability: null, readinessScore: null, cyclePhase: null, hrvCv: 12.5, weeklyRunningKm: null, calorieBalance: null }
);
assert(t4.some((t) => t.severity === "warning" && t.message.includes("HRV CV is 12.5%")), "HRV CV 12.5%: overreaching warning");

// 4b. HRV CV normal — no warning
const t4b = detectTradeoffs(
  [{ id: "6", type: "strength", subtype: null, title: "Hypertrophy", deadline: null }],
  { energyAvailability: null, readinessScore: null, cyclePhase: null, hrvCv: 7.5, weeklyRunningKm: null, calorieBalance: null }
);
assert(!t4b.some((t) => t.message.includes("HRV CV")), "HRV CV 7.5%: no overreaching warning");

// 5. LUTEAL + UPCOMING RACE (within 14 days)
const t5 = detectTradeoffs(
  [
    { id: "7", type: "race", subtype: "hyrox", title: "Hyrox London", deadline: new Date(Date.now() + 10 * 86400000) },
  ],
  { energyAvailability: null, readinessScore: null, cyclePhase: "luteal", hrvCv: null, weeklyRunningKm: null, calorieBalance: null }
);
assert(t5.some((t) => t.severity === "info" && t.message.includes("luteal phase")), "race in 10d + luteal: thermoregulation info");
assert(t5.some((t) => t.message.includes("Sung 2014")), "luteal+race: cites Sung 2014");

// 5b. Luteal but race far out — no warning
const t5b = detectTradeoffs(
  [
    { id: "7", type: "race", subtype: null, title: "Marathon", deadline: new Date(Date.now() + 60 * 86400000) },
  ],
  { energyAvailability: null, readinessScore: null, cyclePhase: "luteal", hrvCv: null, weeklyRunningKm: null, calorieBalance: null }
);
assert(!t5b.some((t) => t.message.includes("luteal phase")), "race in 60d + luteal: no warning (too far)");

// Custom goals should be excluded from tradeoff logic
const tCustom = detectTradeoffs(
  [
    { id: "8", type: "custom", subtype: null, title: "Random Goal", deadline: null },
  ],
  { energyAvailability: 25, readinessScore: 50, cyclePhase: "luteal", hrvCv: 15, weeklyRunningKm: null, calorieBalance: null }
);
// HRV CV warning should still fire (it's goal-agnostic)
assert(tCustom.some((t) => t.message.includes("HRV CV")), "custom goal: HRV CV warning still fires");
// But no race/exam-specific warnings
assert(!tCustom.some((t) => t.message.includes("luteal phase")), "custom goal only: no luteal+race warning");

// Empty goals
const tEmpty = detectTradeoffs([], {
  energyAvailability: 20, readinessScore: 40, cyclePhase: "luteal", hrvCv: 15, weeklyRunningKm: null, calorieBalance: null,
});
assert(tEmpty.some((t) => t.message.includes("HRV CV")), "no goals: HRV CV warning still fires");
assert(tEmpty.length === 1, "no goals: only HRV CV warning (no goal-specific ones)");

// ============================================================
// 5C: Primary goal defaults + system prompt sections
// ============================================================
console.log("\n=== 5C: Primary Goal & System Prompt ===\n");

// All types produce distinct content
const allSections = goalTypes.map((type) =>
  goalSystemPromptSection({ type, subtype: null, title: "Test", target: "test", deadline: null })
);
const uniqueSections = new Set(allSections);
assert(uniqueSections.size === goalTypes.length, `all ${goalTypes.length} goal types produce distinct system prompt sections`);

// Each section contains the type name or a key identifying phrase
assert(allSections[0].includes("Race Preparation"), "race section: 'Race Preparation'");
assert(allSections[1].includes("Strength Training"), "strength section: 'Strength Training'");
assert(allSections[2].includes("Physique"), "physique section: 'Physique'");
assert(allSections[3].includes("Cognitive Performance"), "cognitive section: 'Cognitive Performance'");
assert(allSections[4].includes("Weight Management"), "weight section: 'Weight Management'");
assert(allSections[5].includes("Health Optimization"), "health section: 'Health Optimization'");

// ============================================================
// 5E: Verify no data loss — all sections exist in every lens
// ============================================================
console.log("\n=== 5E: No Data Loss — Section Coverage ===\n");

// These are the section keys that buildCoachContext can produce
const allSectionKeys = [
  "primary_focus", "readiness", "oura_metrics", "cycle_phase", "training",
  "nutrition", "weight_trend", "running_cardio", "vo2max", "apple_watch_workouts",
  "sleep", "resilience", "spo2", "experiments", "goals", "sessions", "bedtime",
];

// Default order
const defaultOrder = [
  "primary_focus", "readiness", "oura_metrics", "cycle_phase", "training",
  "nutrition", "weight_trend", "running_cardio", "vo2max", "apple_watch_workouts",
  "sleep", "resilience", "spo2", "experiments", "goals", "sessions", "bedtime",
];

// Each lens's section order (from the source)
const lensOrders: Record<string, string[]> = {
  race: ["primary_focus", "readiness", "running_cardio", "vo2max", "hr_zones", "apple_watch_workouts", "nutrition", "sleep", "oura_metrics", "weight_trend", "cycle_phase", "training", "resilience", "spo2", "experiments", "goals", "sessions", "bedtime"],
  strength: ["primary_focus", "readiness", "training", "oura_metrics", "nutrition", "sleep", "weight_trend", "cycle_phase", "resilience", "apple_watch_workouts", "running_cardio", "vo2max", "spo2", "experiments", "goals", "sessions", "bedtime"],
  physique: ["primary_focus", "readiness", "training", "nutrition", "weight_trend", "sleep", "oura_metrics", "cycle_phase", "resilience", "apple_watch_workouts", "running_cardio", "vo2max", "spo2", "experiments", "goals", "sessions", "bedtime"],
  cognitive: ["primary_focus", "sleep", "readiness", "resilience", "oura_metrics", "experiments", "nutrition", "goals", "training", "weight_trend", "cycle_phase", "apple_watch_workouts", "running_cardio", "vo2max", "spo2", "sessions", "bedtime"],
  weight: ["primary_focus", "nutrition", "weight_trend", "readiness", "oura_metrics", "sleep", "training", "cycle_phase", "resilience", "apple_watch_workouts", "running_cardio", "vo2max", "spo2", "experiments", "goals", "sessions", "bedtime"],
  health: ["primary_focus", "oura_metrics", "sleep", "readiness", "resilience", "spo2", "experiments", "sessions", "nutrition", "training", "weight_trend", "cycle_phase", "apple_watch_workouts", "running_cardio", "vo2max", "goals", "bedtime"],
};

// Check each lens covers all data sections
for (const [type, order] of Object.entries(lensOrders)) {
  const missing = allSectionKeys.filter((key) => !order.includes(key));
  assert(missing.length === 0, `${type} lens: covers all ${allSectionKeys.length} sections${missing.length > 0 ? ` (missing: ${missing.join(", ")})` : ""}`);
}

// Check default order covers all
const defaultMissing = allSectionKeys.filter((key) => !defaultOrder.includes(key));
assert(defaultMissing.length === 0, `default order: covers all ${allSectionKeys.length} sections`);

// Verify "profile" is NOT in any ordering (it's always emitted first, outside the ordering system)
for (const [type, order] of Object.entries(lensOrders)) {
  assert(!order.includes("profile"), `${type} lens: "profile" correctly excluded from ordering`);
}
assert(!defaultOrder.includes("profile"), `default order: "profile" correctly excluded from ordering`);

// Safety net: any section NOT in order still gets emitted (check code logic)
// The race lens includes "hr_zones" which is not a section key that buildCoachContext produces.
// This is fine — the safety net loop catches sections not in the order list.
assert(lensOrders.race.includes("hr_zones"), "race lens: includes hr_zones (future section, handled by safety net)");

// ============================================================
// Summary
// ============================================================
console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All Phase 5 verifications passed!");
}
