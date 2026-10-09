export type AgeInfo = { birth_year: number | null; birth_date?: string | Date | null };

const YEAR_MS = 365.2425 * 86_400_000;

function ageAt(from: Date, now: Date) {
  return Math.floor((now.getTime() - from.getTime()) / YEAR_MS);
}

/**
 * Age bounds. With an exact birth date min == max. With only a birth year, the athlete was born
 * somewhere in that calendar year, so the bounds are the ages for Dec 31 and Jan 1.
 */
export function ageBounds(a: AgeInfo, now = new Date()): { min: number; max: number } | null {
  if (a.birth_date) {
    const d = typeof a.birth_date === "string" ? new Date(a.birth_date) : a.birth_date;
    if (!Number.isNaN(d.getTime())) {
      const age = ageAt(d, now);
      return { min: age, max: age };
    }
  }
  if (!a.birth_year) return null;
  return {
    min: ageAt(new Date(Date.UTC(a.birth_year, 11, 31)), now),
    max: ageAt(new Date(Date.UTC(a.birth_year, 0, 1)), now),
  };
}

/** True unless we can be sure the athlete is an adult. Unknown age is treated as a minor. */
export function isPotentialMinor(a: AgeInfo, now = new Date()): boolean {
  const b = ageBounds(a, now);
  return !b || b.min < 18;
}

export type Eligibility = { eligible: true } | { eligible: false; reason: "unverified_age" | "too_young" };

export function checkContactEligibility(a: AgeInfo, minContactAge: number, now = new Date()): Eligibility {
  const b = ageBounds(a, now);
  if (!b) return { eligible: false, reason: "unverified_age" };
  if (b.max < minContactAge) return { eligible: false, reason: "too_young" };
  return { eligible: true };
}

/** Minors always need a human to approve the exact text before it goes out. */
export function requiresHumanApproval(a: AgeInfo, autoApproveAdults: boolean, now = new Date()): boolean {
  return isPotentialMinor(a, now) || !autoApproveAdults;
}
