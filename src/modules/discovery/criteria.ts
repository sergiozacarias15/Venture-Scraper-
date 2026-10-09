import type { DiscoveredAthlete, DiscoveryCriteria } from "./types";

/**
 * Strict filter: athletes whose birth year, gender, nationality (or position, when
 * requested) is unknown are excluded, because eligibility cannot be verified.
 */
export function matchesCriteria(a: DiscoveredAthlete, c: DiscoveryCriteria): boolean {
  if (!a.birthYear || !c.birthYears.includes(a.birthYear)) return false;
  if (c.genders.length && (!a.gender || !c.genders.includes(a.gender))) return false;
  if (c.countries.length && (!a.nationality || !c.countries.includes(a.nationality))) return false;
  if (c.positions.length && (!a.position || !c.positions.includes(a.position))) return false;
  return true;
}
