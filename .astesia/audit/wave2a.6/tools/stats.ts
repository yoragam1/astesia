/**
 * .astesia/audit/wave2a.6/tools/stats.ts
 * Wilson 95% confidence interval upper bound (z = 1.96), clamped to [0, 1].
 * For n = 0, returns "n/a".
 * Keputusan 4: Exact test vectors (0,1)->0.7935; (0,10)->0.2775; (0,60)->0.0602; (1,1)->1.0.
 */

export const WILSON_Z_95 = 1.96;

export function wilsonUpper95(k: number, n: number, z: number = WILSON_Z_95): number | "n/a" {
  if (n <= 0) return "n/a";
  if (k < 0 || k > n) {
    throw new Error(`Invalid Wilson parameters: k=${k}, n=${n}`);
  }
  const pHat = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = pHat + z2 / (2 * n);
  const spread = z * Math.sqrt((pHat * (1 - pHat)) / n + z2 / (4 * n * n));
  const rawUpper = (center + spread) / denom;
  return Math.min(1, Math.max(0, rawUpper));
}

export function formatWilsonUpper95(k: number, n: number): string {
  const ub = wilsonUpper95(k, n);
  if (ub === "n/a") return "n/a";
  return `${(ub * 100).toFixed(2)}% (UB=${ub.toFixed(4)})`;
}

export function runStatsSelfTest(): { total: number; passed: number; failed: number; errors: string[] } {
  const cases: Array<{ k: number; n: number; expected: number | "n/a"; tol?: number }> = [
    { k: 0, n: 1, expected: 0.7935, tol: 0.0005 },
    { k: 0, n: 10, expected: 0.2775, tol: 0.0005 },
    { k: 0, n: 60, expected: 0.0602, tol: 0.0005 },
    { k: 1, n: 1, expected: 1.0, tol: 0.0005 },
    { k: 0, n: 0, expected: "n/a" }
  ];

  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const tc of cases) {
    const actual = wilsonUpper95(tc.k, tc.n);
    if (tc.expected === "n/a") {
      if (actual === "n/a") passed++;
      else {
        failed++;
        errors.push(`wilsonUpper95(${tc.k}, ${tc.n}): expected 'n/a', got ${actual}`);
      }
    } else {
      if (typeof actual === "number" && Math.abs(actual - tc.expected) <= (tc.tol ?? 0.0005) && actual >= 0 && actual <= 1) {
        passed++;
      } else {
        failed++;
        errors.push(`wilsonUpper95(${tc.k}, ${tc.n}): expected ${tc.expected} (±${tc.tol}), got ${actual}`);
      }
    }
  }

  return { total: cases.length, passed, failed, errors };
}

if (import.meta.main) {
  const res = runStatsSelfTest();
  console.log(`Stats Self-Test: ${res.passed}/${res.total} passed (${res.failed} failed)`);
  if (res.failed > 0) {
    console.error(res.errors.join("\n"));
    process.exit(1);
  }
}
