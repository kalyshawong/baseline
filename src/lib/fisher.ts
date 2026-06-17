/**
 * Fisher's exact test (two-tailed) for a 2x2 contingency table.
 *
 * Correct at the small n we have for binary outcomes (e.g. GI failure rate
 * with/without a pre-workout factor, or treatment vs control in an
 * experiment). Use this instead of a t-test whenever the outcome is a RATE,
 * not a continuous mean. Shared by meal-gi.ts and correlation.ts.
 *
 *   table = [[a, b], [c, d]]   // e.g. [[present&failed, present&clean], [absent&failed, absent&clean]]
 */
function logFactorialTable(n: number): number[] {
  const t = new Array(n + 1).fill(0);
  for (let i = 2; i <= n; i++) t[i] = t[i - 1] + Math.log(i);
  return t;
}

export function fisherExactTwoTailed(a: number, b: number, c: number, d: number): number {
  const n = a + b + c + d;
  if (n === 0) return 1;
  const lf = logFactorialTable(n);
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const c2 = b + d;
  const constLog = lf[r1] + lf[r2] + lf[c1] + lf[c2] - lf[n];
  const pOf = (aa: number) => {
    const bb = r1 - aa;
    const cc = c1 - aa;
    const dd = r2 - cc;
    if (bb < 0 || cc < 0 || dd < 0) return 0;
    return Math.exp(constLog - lf[aa] - lf[bb] - lf[cc] - lf[dd]);
  };
  const pObs = pOf(a);
  const lo = Math.max(0, c1 - r2);
  const hi = Math.min(r1, c1);
  let p = 0;
  const EPS = 1e-9;
  for (let aa = lo; aa <= hi; aa++) {
    const pp = pOf(aa);
    if (pp <= pObs + EPS) p += pp;
  }
  return Math.min(1, p);
}

/**
 * Cohen's h — effect size for the difference between two proportions.
 * h = 2*asin(sqrt(p1)) - 2*asin(sqrt(p2)). Magnitude bands match Cohen's d
 * conventions (0.2 small, 0.5 medium, 0.8 large).
 */
export function cohensH(p1: number, p2: number): number {
  const phi = (p: number) => 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, p))));
  return phi(p1) - phi(p2);
}
