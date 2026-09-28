/**
 * Best-guess primary muscle group for an exercise name the library doesn't
 * know (free-text workout logging creates these). Order matters: the more
 * specific phrase wins ("rear delt pushdown" is shoulders, not triceps;
 * "leg curl" is hamstrings, not biceps). Unknown names return "other", which
 * the weekly-volume view ignores — better to miss a set than to count it
 * against the wrong muscle.
 */
const RULES: [RegExp, string][] = [
  [/rear delt|face pull|reverse fly|lateral raise|front raise|shoulder press|overhead press|\bohp\b|arnold|upright row|\bdelt/, "shoulders"],
  [/leg curl|hamstring|\brdl\b|romanian|good morning|nordic|stiff[- ]leg/, "hamstrings"],
  [/calf|calves/, "calves"],
  [/abduct|hip thrust|glute|bridge|kickback|frog pump/, "glutes"],
  [/crunch|plank|\babs?\b|\bcore\b|sit[- ]?up|leg raise|knee raise|russian twist|pallof|dead ?bug|rollout|hollow|woodchop|oblique/, "core"],
  [/tricep|pushdown|skull ?crusher|\bdips?\b|close[- ]grip bench|kickback/, "triceps"],
  [/bicep|curl|chin[- ]?up/, "biceps"],
  [/row|pulldown|pull[- ]?up|\blat\b|lats|pullover|back extension/, "back"],
  [/squat|leg press|lunge|leg extension|step[- ]?up|hack/, "quads"],
  [/deadlift/, "hamstrings"],
  [/bench|chest|incline|decline|\bfly\b|flye|push[- ]?up|\bpec/, "chest"],
];

export function inferMuscleGroup(name: string): string {
  const n = name.toLowerCase();
  for (const [re, group] of RULES) if (re.test(n)) return group;
  return "other";
}
